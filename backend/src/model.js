export const ENGINE_VERSION = '1.1.0';
export const OPENING_INVENTORY_BUDGET = 40000;
export const OPENING_OPERATING_CASH = 15000;
export const SIMULATION_DAYS = 60;
export const SIMULATED_START_DATE = '2026-08-03'; // Monday; the model is synthetic, not a forecast of these calendar dates.

export const CUSTOMER_TYPES = {
  'Office Worker': {
    weekdayWeight: 0.34,
    weekendWeight: 0.07,
    categoryAffinity: {
      'Ready-to-Eat': 1.55, 'Drinks': 1.35, 'Snacks & Confectionery': 1.15,
      'Fresh & Bakery': 0.85, 'Dairy & Chilled': 0.70, 'Grocery & Pantry': 0.55,
      'Household Essentials': 0.28, 'Personal & Convenience': 0.38
    },
    missionWeights: { 'Quick Lunch':0.42, 'Snack & Drink':0.25, 'Breakfast':0.12, 'Top-Up Grocery':0.09, 'Dinner Convenience':0.08, 'Household Top-Up':0.04 }
  },
  'Student': {
    weekdayWeight: 0.25,
    weekendWeight: 0.19,
    categoryAffinity: {
      'Ready-to-Eat': 1.20, 'Drinks': 1.45, 'Snacks & Confectionery': 1.40,
      'Fresh & Bakery': 0.72, 'Dairy & Chilled': 0.78, 'Grocery & Pantry': 1.05,
      'Household Essentials': 0.38, 'Personal & Convenience': 0.48
    },
    missionWeights: { 'Quick Lunch':0.22, 'Snack & Drink':0.34, 'Breakfast':0.10, 'Top-Up Grocery':0.16, 'Dinner Convenience':0.15, 'Household Top-Up':0.03 }
  },
  'CBD Resident': {
    weekdayWeight: 0.17,
    weekendWeight: 0.25,
    categoryAffinity: {
      'Ready-to-Eat': 0.88, 'Drinks': 0.82, 'Snacks & Confectionery': 0.72,
      'Fresh & Bakery': 1.30, 'Dairy & Chilled': 1.35, 'Grocery & Pantry': 1.40,
      'Household Essentials': 1.30, 'Personal & Convenience': 1.02
    },
    missionWeights: { 'Quick Lunch':0.08, 'Snack & Drink':0.08, 'Breakfast':0.12, 'Top-Up Grocery':0.40, 'Dinner Convenience':0.20, 'Household Top-Up':0.12 }
  },
  'Tourist': {
    weekdayWeight: 0.14,
    weekendWeight: 0.30,
    categoryAffinity: {
      'Ready-to-Eat': 1.18, 'Drinks': 1.45, 'Snacks & Confectionery': 1.25,
      'Fresh & Bakery': 0.78, 'Dairy & Chilled': 0.52, 'Grocery & Pantry': 0.34,
      'Household Essentials': 0.18, 'Personal & Convenience': 0.72
    },
    missionWeights: { 'Quick Lunch':0.24, 'Snack & Drink':0.44, 'Breakfast':0.12, 'Top-Up Grocery':0.05, 'Dinner Convenience':0.11, 'Household Top-Up':0.04 }
  },
  'Convenience Shopper': {
    weekdayWeight: 0.10,
    weekendWeight: 0.19,
    categoryAffinity: {
      'Ready-to-Eat': 1.08, 'Drinks': 1.05, 'Snacks & Confectionery': 0.92,
      'Fresh & Bakery': 1.00, 'Dairy & Chilled': 1.02, 'Grocery & Pantry': 1.02,
      'Household Essentials': 0.82, 'Personal & Convenience': 0.85
    },
    missionWeights: { 'Quick Lunch':0.12, 'Snack & Drink':0.15, 'Breakfast':0.10, 'Top-Up Grocery':0.31, 'Dinner Convenience':0.20, 'Household Top-Up':0.12 }
  }
};

export const SHOPPING_MISSIONS = {
  'Quick Lunch': {
    basketMin: 1, basketMax: 4,
    categoryWeights: { 'Ready-to-Eat':2.5, 'Drinks':1.8, 'Snacks & Confectionery':0.8, 'Fresh & Bakery':0.55, 'Dairy & Chilled':0.35, 'Grocery & Pantry':0.18, 'Household Essentials':0.03, 'Personal & Convenience':0.06 },
    arrivalWeights: { Morning:0.06, Lunch:0.68, Afternoon:0.20, Evening:0.06 }
  },
  'Snack & Drink': {
    basketMin: 1, basketMax: 3,
    categoryWeights: { 'Ready-to-Eat':0.35, 'Drinks':2.2, 'Snacks & Confectionery':2.0, 'Fresh & Bakery':0.40, 'Dairy & Chilled':0.30, 'Grocery & Pantry':0.12, 'Household Essentials':0.02, 'Personal & Convenience':0.08 },
    arrivalWeights: { Morning:0.14, Lunch:0.25, Afternoon:0.40, Evening:0.21 }
  },
  'Breakfast': {
    basketMin: 2, basketMax: 5,
    categoryWeights: { 'Ready-to-Eat':0.45, 'Drinks':1.20, 'Snacks & Confectionery':0.45, 'Fresh & Bakery':1.65, 'Dairy & Chilled':1.65, 'Grocery & Pantry':1.10, 'Household Essentials':0.06, 'Personal & Convenience':0.08 },
    arrivalWeights: { Morning:0.74, Lunch:0.12, Afternoon:0.08, Evening:0.06 }
  },
  'Top-Up Grocery': {
    basketMin: 3, basketMax: 8,
    categoryWeights: { 'Ready-to-Eat':0.55, 'Drinks':0.70, 'Snacks & Confectionery':0.60, 'Fresh & Bakery':1.45, 'Dairy & Chilled':1.55, 'Grocery & Pantry':1.75, 'Household Essentials':0.85, 'Personal & Convenience':0.55 },
    arrivalWeights: { Morning:0.13, Lunch:0.17, Afternoon:0.27, Evening:0.43 }
  },
  'Dinner Convenience': {
    basketMin: 2, basketMax: 6,
    categoryWeights: { 'Ready-to-Eat':1.75, 'Drinks':0.85, 'Snacks & Confectionery':0.60, 'Fresh & Bakery':0.85, 'Dairy & Chilled':0.80, 'Grocery & Pantry':1.15, 'Household Essentials':0.18, 'Personal & Convenience':0.12 },
    arrivalWeights: { Morning:0.03, Lunch:0.11, Afternoon:0.25, Evening:0.61 }
  },
  'Household Top-Up': {
    basketMin: 2, basketMax: 5,
    categoryWeights: { 'Ready-to-Eat':0.15, 'Drinks':0.25, 'Snacks & Confectionery':0.22, 'Fresh & Bakery':0.35, 'Dairy & Chilled':0.45, 'Grocery & Pantry':0.80, 'Household Essentials':2.25, 'Personal & Convenience':1.65 },
    arrivalWeights: { Morning:0.12, Lunch:0.14, Afternoon:0.30, Evening:0.44 }
  }
};

export const DAY_VISIT_MEANS = {
  Monday: 132,
  Tuesday: 136,
  Wednesday: 142,
  Thursday: 150,
  Friday: 170,
  Saturday: 128,
  Sunday: 104
};

export const DAY_DEMAND_FACTORS = {
  Monday: 0.96,
  Tuesday: 0.98,
  Wednesday: 1.00,
  Thursday: 1.04,
  Friday: 1.12,
  Saturday: 1.02,
  Sunday: 0.92
};

export const MODEL_DECLARATION = {
  purpose: 'A pre-operational, synthetic 60-day simulation of a small autonomous CBD supermarket. It tests internal coherence, autonomous operations and commercial reporting; it is not a forecast of a real store.',
  operatingContext: 'The fictional store is located in the Swanston Street / Melbourne Town Hall vicinity and uses a small IGA-style supermarket format. No staff are physically present during normal operation; a company manager monitors the store remotely.',
  customerActivity: 'Customer records represent shopping visits rather than CBD pedestrian footfall, so the model does not include a separate passer-by conversion funnel. Daily shopping visits vary by day of week around declared means. Customer mix changes between weekdays and weekends. Each customer is assigned one of five customer types, a shopping mission and a time-of-day period.',
  shoppingDemand: 'Basket size is mission-dependent. Product selection is weighted by shopping-mission category preference, customer-type category affinity, product popularity and a small seeded stochastic component. Demand is therefore structured rather than uniform. A customer may substitute within the same category when the originally selected product is unavailable.',
  perishability: 'Perishable inventory is stored in dated batches. Opening stock is deliberately staggered across remaining shelf life to represent stock already on shelf at Day 1. Replenishment arrives with full declared shelf life. Units that reach expiry are written off before customers arrive, and sales consume the earliest-expiring eligible batch first (FEFO).',
  brainDetection: 'At each day-end the Store Brain identifies sold-out products, low stock using recent sales velocity and days-of-cover rules, batches approaching expiry, and slow-moving stock where days of cover materially exceeds the product-specific threshold.',
  replenishment: 'Replenishment uses a fixed one-day lead time. Candidates are prioritised using sold-out status, low days of cover, observed sales velocity, essentiality and margin. The desired order lifts stock toward a product-specific target days of cover. Perishable targets are deliberately shorter than shelf life. Slow-moving or expiry-risk products can be held from reorder.',
  cashConstraint: 'Order cost is deducted when the order is placed. Candidates are processed in priority order and may be partially filled if operating cash is insufficient. No order is placed after Day 60 because there is no Day 61 within the model horizon.',
  finance: 'Opening inventory is funded separately and capped at A$40,000. Operating cash begins at A$15,000. Cash increases with recorded sales and decreases only when replenishment orders are placed. Gross profit is sales revenue less the acquisition cost of units sold; expiry/write-off value is reported separately.',
  limitations: 'The model uses synthetic demand assumptions rather than observed Swanston Street data, a fixed one-day supplier lead time, fixed prices and purchase costs, no staffing/rent/utilities, and no markdown or promotion strategy. Findings therefore require later calibration with real operating data.'
};

export const MODEL_CONFIG = {
  simulationDays: SIMULATION_DAYS,
  simulatedStartDate: SIMULATED_START_DATE,
  openingInventoryBudget: OPENING_INVENTORY_BUDGET,
  openingOperatingCash: OPENING_OPERATING_CASH,
  dayVisitMeans: DAY_VISIT_MEANS,
  dayDemandFactors: DAY_DEMAND_FACTORS,
  customerTypes: CUSTOMER_TYPES,
  shoppingMissions: SHOPPING_MISSIONS,
  rules: {
    leadTimeDays: 1,
    expiryWarningDays: 2,
    recentSalesWindowDays: 7,
    slowMovingMinimumAgeDays: 14,
    substitutionProbability: 0.35,
    maxUnitsPerProductPerBasket: 2,
    completedHistoryEditable: false
  }
};
