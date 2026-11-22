/**
 * High-quality curated food photography resolver for restaurant POS menu items.
 * Intelligently maps menu item names and categories to optimized Unsplash culinary photos.
 */

// Curated high-res food photos with CDN parameters optimized for POS performance (fast load, cached)
const FOOD_IMAGE_MAP: Array<{ keywords: string[]; url: string }> = [
  // Biryani & Rice Dishes
  {
    keywords: ['biryani', 'biriyani', 'briyani', 'pulao', 'pulav', 'fried rice', 'jeera rice', 'khichdi'],
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Pizza
  {
    keywords: ['pizza', 'margherita', 'pepperoni', 'calzone'],
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Burger
  {
    keywords: ['burger', 'cheeseburger', 'whopper', 'slider'],
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Sandwiches & Wraps
  {
    keywords: ['sandwich', 'toast', 'panini', 'sub', 'wrap', 'roll', 'frankie', 'shawarma', 'burrito', 'taco'],
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // South Indian (Dosa, Idli, Vada, Uttapam)
  {
    keywords: ['dosa', 'masala dosa', 'idli', 'vada', 'wada', 'uttapam', 'upma', 'sambar', 'rasam'],
    url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Indian Curries & Paneer
  {
    keywords: ['paneer', 'butter masala', 'tikka masala', 'palak', 'shahi paneer', 'kadai', 'kadhai', 'dal makhani', 'daal', 'dal tadka', 'chole', 'rajma', 'curry', 'gravy'],
    url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Tandoor, Naan & Rotis
  {
    keywords: ['naan', 'roti', 'paratha', 'kulcha', 'chapati', 'poori', 'bhatura'],
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // French Fries, Starters & Snacks
  {
    keywords: ['fries', 'french fries', 'nuggets', 'wedges', 'pakora', 'bhajiya', 'samosa', 'finger food', 'chips', 'nachos'],
    url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Noodles, Chinese, Momos & Pasta
  {
    keywords: ['noodles', 'chowmein', 'manchurian', 'hakka', 'schezwan', 'pasta', 'spaghetti', 'penne', 'macaroni', 'lasagna', 'momo', 'momos', 'dim sum', 'dumpling'],
    url: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Chicken, Tandoori & Non-Veg Starters
  {
    keywords: ['chicken', 'tandoori', 'kebab', 'kabab', 'tikka', 'lollipop', 'wings', 'mutton', 'lamb', 'meat', 'pork', 'beef', 'steak'],
    url: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Fish & Seafood
  {
    keywords: ['fish', 'prawn', 'prawns', 'shrimp', 'crab', 'seafood', 'salmon', 'tuna'],
    url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Chai & Hot Tea
  {
    keywords: ['tea', 'chai', 'irani chai', 'masala chai', 'green tea', 'lemon tea'],
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Coffee (Hot)
  {
    keywords: ['coffee', 'cappuccino', 'latte', 'espresso', 'filter coffee', 'americano', 'mocha'],
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Shakes, Cold Coffee & Smoothies
  {
    keywords: ['cold coffee', 'milkshake', 'shake', 'smoothie', 'frappe', 'chocolate shake', 'oreo', 'thick shake', 'lassi'],
    url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Juices, Mocktails & Soft Drinks
  {
    keywords: ['juice', 'mojito', 'mocktail', 'cocktail', 'lemonade', 'soda', 'beverage', 'drink', 'cola', 'fizz'],
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Soups & Salads
  {
    keywords: ['soup', 'shorba', 'salad', 'caesar', 'healthy', 'greens'],
    url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Desserts, Ice Cream & Sweets
  {
    keywords: ['ice cream', 'dessert', 'cake', 'pastry', 'brownie', 'gulab jamun', 'rasgulla', 'halwa', 'kulfi', 'waffle', 'pancake', 'sweet', 'pastry', 'donut'],
    url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=350&h=240&q=80',
  },
  // Thali / Full Meals
  {
    keywords: ['thali', 'meal', 'combo', 'lunch thali', 'dinner thali'],
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=350&h=240&q=80',
  },
];

// Fallback high-res food photo
const DEFAULT_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=350&h=240&q=80';

/**
 * Resolves an automatic appetizing food photography URL for any menu item.
 * Prioritizes user-uploaded imageUrl if present; otherwise matches dish keywords.
 */
export const getAutoMenuItemImage = (
  itemName: string,
  categoryName?: string,
  userImage?: string
): string => {
  if (userImage && userImage.trim().length > 5) {
    return userImage.trim();
  }

  const query = `${itemName || ''} ${categoryName || ''}`.toLowerCase();

  for (const entry of FOOD_IMAGE_MAP) {
    for (const keyword of entry.keywords) {
      if (query.includes(keyword)) {
        return entry.url;
      }
    }
  }

  return DEFAULT_FOOD_IMAGE;
};

