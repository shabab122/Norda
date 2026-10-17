// Fictional demo inventory with AI-generated catalog photography.
const photo = (key) => "/assets/products/photos/" + key + ".webp";
const categories = [
  [
    "Electronics",
    "headphones"
  ],
  [
    "Fashion",
    "jacket"
  ],
  [
    "Home & Kitchen",
    "cookware"
  ],
  [
    "Sports & Outdoors",
    "yoga"
  ],
  [
    "Books",
    "clean-code"
  ],
  [
    "Beauty & Personal Care",
    "serum"
  ],
  [
    "Bags & Travel",
    "backpack"
  ],
  [
    "Furniture & Lighting",
    "chair"
  ],
  [
    "Office & Stationery",
    "notebook"
  ],
  [
    "Toys & Games",
    "blocks"
  ],
  [
    "Grocery & Pantry",
    "coffee"
  ],
  [
    "Garden & Living",
    "planter"
  ]
].map(([name, key]) => ({ name, image: photo(key) }));
const rows = [
  [
    "Wireless Bluetooth Headphones",
    "Electronics",
    "SoundMax",
    "headphones",
    5200,
    4490,
    40,
    true,
    "Forest-green over-ear headphones with cushioned ear cups and a foldable everyday design. A comfortable companion for music, study and calls."
  ],
  [
    "Smartwatch Fitness Tracker",
    "Electronics",
    "FitTrack",
    "watch",
    7850,
    6990,
    3,
    false,
    "A compact everyday smartwatch with a soft silicone strap and a clear display. A simple accessory for keeping your day organised."
  ],
  [
    "Men's Casual Denim Jacket",
    "Fashion",
    "UrbanWear",
    "jacket",
    3900,
    3290,
    30,
    false,
    "A classic blue denim jacket with button fastening, chest pockets and an easy everyday fit. Layer it over your favourite tee."
  ],
  [
    "Women's Running Shoes",
    "Fashion",
    "StrideFit",
    "shoes",
    5600,
    4790,
    50,
    true,
    "Neutral running-style trainers with a breathable upper, cushioned sole and lace-up fit. Comfortable styling for your daily routine."
  ],
  [
    "Non-Stick Cookware Set",
    "Home & Kitchen",
    "ChefPro",
    "cookware",
    9800,
    8490,
    15,
    true,
    "A coordinated dark cookware collection with useful everyday pots, frying pans and fitted lids. A thoughtful addition to a compact kitchen."
  ],
  [
    "Electric Kettle 1.7L",
    "Home & Kitchen",
    "HomeEase",
    "kettle",
    2600,
    2290,
    60,
    false,
    "A clean-lined electric kettle with a comfortable handle and serving base. An everyday essential for a welcoming kitchen."
  ],
  [
    "Yoga Mat with Carry Strap",
    "Sports & Outdoors",
    "ZenFit",
    "yoga",
    2200,
    1790,
    80,
    true,
    "A soft sage exercise mat with a textured surface and carry strap. Roll it out for stretching, yoga or a quiet moment at home."
  ],
  [
    "Adjustable Dumbbell Set",
    "Sports & Outdoors",
    "IronCore",
    "dumbbells",
    12500,
    10990,
    10,
    false,
    "A compact pair of adjustable-style dumbbells with comfortable grips and storage bases. A practical addition to a home workout corner."
  ],
  [
    "The Art of Clean Code",
    "Books",
    "TechPress",
    "clean-code",
    1850,
    1490,
    100,
    false,
    "A fictional programming hardcover for the NORDA demonstration book collection. Its minimal cover suits a thoughtful study space."
  ],
  [
    "Mystery Island",
    "Books",
    "Penbound",
    "mystery",
    1200,
    990,
    70,
    false,
    "A fictional mystery title from the NORDA sample collection. A beautifully bound navy novel for an evening reading corner."
  ],
  [
    "Everyday Hydration Serum",
    "Beauty & Personal Care",
    "Norda Care",
    "serum",
    1450,
    1190,
    35,
    true,
    "An amber glass dropper bottle with a minimal presentation. An illustrative personal-care item for exploring the beauty collection."
  ],
  [
    "Gentle Daily Cleanser",
    "Beauty & Personal Care",
    "Norda Care",
    "cleanser",
    950,
    0,
    42,
    false,
    "A simple cleanser bottle in clean neutral packaging. An illustrative personal-care product without medical or treatment claims."
  ],
  [
    "Everyday Commuter Backpack",
    "Bags & Travel",
    "Roam Studio",
    "backpack",
    3200,
    2690,
    28,
    true,
    "A structured commuter backpack with a spacious main compartment and padded shoulder straps. Ready for class, work or a day out."
  ],
  [
    "Weekend Cabin Suitcase",
    "Bags & Travel",
    "Roam Studio",
    "suitcase",
    8900,
    7490,
    4,
    false,
    "A compact hard-shell cabin-style case with smooth wheels and a telescopic handle. Check your airline size policy before travelling."
  ],
  [
    "Lounge Accent Chair",
    "Furniture & Lighting",
    "Nest Living",
    "chair",
    18500,
    15990,
    6,
    false,
    "An upholstered accent chair with warm wood details and a sculptural silhouette. A cosy focal point for a reading nook."
  ],
  [
    "Arc Desk Lamp",
    "Furniture & Lighting",
    "Nest Living",
    "lamp",
    3400,
    2890,
    18,
    false,
    "A sculptural desk lamp with a softly curved profile and a warm neutral finish. A considered detail for a desk or bedside table."
  ],
  [
    "Dotted Journal and Pen",
    "Office & Stationery",
    "Paperfolk",
    "notebook",
    650,
    490,
    65,
    false,
    "A neatly bound journal with a writing companion. Keep plans, notes and everyday ideas together in one place."
  ],
  [
    "Modular Desk Organizer",
    "Office & Stationery",
    "Paperfolk",
    "organizer",
    1250,
    0,
    0,
    false,
    "An organiser for pens, small accessories and daily essentials. Currently sold out so the store availability states can be explored."
  ],
  [
    "Wooden Building Blocks",
    "Toys & Games",
    "Playroom",
    "blocks",
    1800,
    1490,
    24,
    false,
    "A colourful wooden block collection with familiar geometric shapes. An illustrative play set; adult supervision is recommended."
  ],
  [
    "Family Board Game Set",
    "Toys & Games",
    "Playroom",
    "board-game",
    2400,
    1990,
    16,
    false,
    "A colourful family tabletop game with a board and playing pieces. A fictional demonstration set for screen-free time together."
  ],
  [
    "Roasted Coffee Beans 250g",
    "Grocery & Pantry",
    "Norda Pantry",
    "coffee",
    890,
    790,
    55,
    true,
    "Coffee beans in a minimal pantry pouch. Demonstration grocery photography; replace with verified food details before a real sale."
  ],
  [
    "Everyday Loose Leaf Tea",
    "Grocery & Pantry",
    "Norda Pantry",
    "tea",
    550,
    0,
    75,
    false,
    "A beautifully presented loose-leaf tea pouch with a quiet everyday feel. A demonstration pantry product for browsing the collection."
  ],
  [
    "Ceramic Planter with Houseplant",
    "Garden & Living",
    "Greenroom",
    "planter",
    1650,
    1390,
    22,
    true,
    "A leafy indoor plant in a softly finished ceramic planter. A fresh accent for a shelf, desk or bright corner at home."
  ],
  [
    "Garden Hand Tool Set",
    "Garden & Living",
    "Greenroom",
    "garden-tools",
    1950,
    1590,
    3,
    false,
    "A compact hand-tool set with wooden handles for small gardening tasks. A practical companion for tending a balcony garden."
  ]
];
const products = rows.map(([name, category, brand, imageKey, price, discountPrice, stock, isFeatured, description]) => ({ name, category, brand, imageKey, images: [photo(imageKey)], price, discountPrice, stock, isFeatured, description }));
module.exports = { categories, products, photo };
