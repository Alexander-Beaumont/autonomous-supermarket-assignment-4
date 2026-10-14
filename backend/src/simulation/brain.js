import { round2 } from './helpers.js';

function avgRecentSales(history, productId, dayNumber, windowDays = 7) {
  const start = Math.max(1, dayNumber - windowDays + 1);
  let total = 0;
  let count = 0;
  for (let day = start; day <= dayNumber; day += 1) {
    total += history.get(day)?.get(productId) || 0;
    count += 1;
  }
  return count ? total / count : 0;
}

export function analyseStoreBrain({
  dayNumber,
  products,
  stockByProduct,
  batchesByProduct,
  salesHistory,
  rules
}) {
  const events = [];
  const candidates = [];
  const productStates = [];

  for (const product of products) {
    const stock = stockByProduct(product.product_id);
    const recentAvg = avgRecentSales(salesHistory, product.product_id, dayNumber, rules.recentSalesWindowDays);
    const baseline = Math.max(0.18, product.popularity * 0.45);
    const forecastDaily = Math.max(baseline, recentAvg);
    const minimumReorderDays = product.perishable ? (product.shelf_life_days <= 3 ? 1.05 : 1.20) : 1.60;
    const effectiveReorderDays = Math.max(product.reorder_days_cover, minimumReorderDays);
    const requestedTargetDays = Math.max(product.target_days_cover, effectiveReorderDays + (product.perishable ? 0.65 : 2.75));
    const effectiveTargetDays = product.perishable
      ? Math.min(requestedTargetDays, Math.max(1.45, product.shelf_life_days * 0.72))
      : requestedTargetDays;
    const reorderPoint = Math.max(1, Math.ceil(forecastDaily * effectiveReorderDays));
    const targetStock = Math.max(reorderPoint + 1, Math.ceil(forecastDaily * effectiveTargetDays));
    const daysCover = recentAvg > 0.05 ? stock / recentAvg : (stock > 0 ? 999 : 0);

    const batches = batchesByProduct.get(product.product_id) || [];
    const expiringSoonQty = product.perishable
      ? batches
          .filter(batch => batch.remaining > 0 && batch.expiryDay != null && batch.expiryDay > dayNumber && batch.expiryDay <= dayNumber + rules.expiryWarningDays)
          .reduce((sum, batch) => sum + batch.remaining, 0)
      : 0;

    const isSlowMoving = dayNumber >= rules.slowMovingMinimumAgeDays
      && stock >= 4
      && daysCover > product.slow_move_days_cover;

    const soldOut = stock === 0;
    const lowStock = stock > 0 && stock <= reorderPoint;
    const expiryRisk = expiringSoonQty > 0;
    const expiryBlocksReorder = expiringSoonQty > Math.max(3, forecastDaily * 1.35);

    if (soldOut) {
      events.push({
        eventType:'SOLD_OUT', productId:product.product_id, productName:product.name, severity:'CRITICAL',
        conditionText:`${product.name} closed Day ${dayNumber} with zero saleable units.`,
        actionText: dayNumber < 60 ? 'Prioritise replenishment for next-day receipt.' : 'Report closing stockout; no Day 61 replenishment is permitted.',
        outcomeText: dayNumber < 60 ? 'Product entered the replenishment priority queue.' : 'Condition retained in the closing report without a new order.',
        metrics:{ stock, recentAverageDailyUnits:round2(recentAvg), reorderPoint, targetStock, daysCover:0 }
      });
    } else if (lowStock) {
      events.push({
        eventType:'LOW_STOCK', productId:product.product_id, productName:product.name, severity:daysCover < 1 ? 'HIGH' : 'WATCH',
        conditionText:`${product.name} closed with ${stock} units, at or below its dynamic reorder point of ${reorderPoint}.`,
        actionText: dayNumber < 60 ? 'Evaluate replenishment against recent sales velocity, expiry risk and available cash.' : 'Report closing low stock; no Day 61 replenishment is permitted.',
        outcomeText: dayNumber < 60 ? 'Product evaluated for the replenishment queue.' : 'Condition retained in the closing report without a new order.',
        metrics:{ stock, recentAverageDailyUnits:round2(recentAvg), reorderPoint, targetStock, daysCover:round2(daysCover) }
      });
    }

    if (expiryRisk) {
      events.push({
        eventType:'EXPIRY_WARNING', productId:product.product_id, productName:product.name, severity:expiringSoonQty >= Math.max(4, forecastDaily * 1.5) ? 'HIGH' : 'WATCH',
        conditionText:`${expiringSoonQty} units of ${product.name} are due to expire within ${rules.expiryWarningDays} days.`,
        actionText:'Use FEFO sales allocation; suppress replenishment only when near-expiry quantity materially exceeds short-term expected demand.',
        outcomeText: expiryBlocksReorder ? 'Near-expiry exposure is high enough to hold routine replenishment.' : 'Warning is retained for visibility, but limited near-expiry stock does not block a necessary low-stock order.',
        metrics:{ stock, expiringSoonQty, forecastDailyUnits:round2(forecastDaily) }
      });
    }

    if (isSlowMoving) {
      events.push({
        eventType:'SLOW_MOVING', productId:product.product_id, productName:product.name, severity:'WATCH',
        conditionText:`${product.name} has approximately ${round2(daysCover)} days of stock at its recent sales rate.`,
        actionText:'Hold replenishment until inventory cover returns to a normal range.',
        outcomeText:'The product is excluded from routine low-stock replenishment unless it becomes sold out.',
        metrics:{ stock, recentAverageDailyUnits:round2(recentAvg), daysCover:round2(daysCover), slowMovingThresholdDays:product.slow_move_days_cover }
      });
    }

    const needsReplenishment = soldOut || lowStock;
    const canOrder = dayNumber < 60 && needsReplenishment && (!isSlowMoving || soldOut) && (!expiryBlocksReorder || soldOut);

    if (canOrder) {
      const desiredQuantity = Math.max(0, targetStock - stock);
      if (desiredQuantity > 0) {
        const marginRate = product.selling_price > 0 ? (product.selling_price - product.purchase_cost) / product.selling_price : 0;
        const urgency = soldOut ? 100 : Math.max(0, 55 - Math.min(45, daysCover * 15));
        const priorityScore = round2(
          urgency
          + Math.min(22, forecastDaily * 2.4)
          + product.essential_weight * 9
          + marginRate * 12
        );
        candidates.push({
          product,
          stock,
          desiredQuantity,
          forecastDaily,
          recentAvg,
          reorderPoint,
          targetStock,
          daysCover,
          priorityScore,
          reason: soldOut
            ? 'Sold out: restore availability with highest operational priority.'
            : `Low stock: ${stock} units versus reorder point ${reorderPoint}; target ${targetStock} units based on recent demand.`
        });
      }
    }

    productStates.push({
      productId: product.product_id,
      stock,
      recentAvg: round2(recentAvg),
      forecastDaily: round2(forecastDaily),
      reorderPoint,
      targetStock,
      daysCover: round2(daysCover),
      expiringSoonQty,
      soldOut,
      lowStock,
      isSlowMoving
    });
  }

  candidates.sort((a, b) => b.priorityScore - a.priorityScore || a.product.product_id.localeCompare(b.product.product_id));
  return { events, candidates, productStates };
}
