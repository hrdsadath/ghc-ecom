export const canisterImg = '/img/canister.jpeg';
export const kettleImg = '/img/borddil kettle.jpeg';
export const cutleryImg = '/img/cuttlery set gold.jpeg';
export const nutsImg = '/img/nuts try.jpeg';
export const jugImg = '/img/primium jug set.jpeg';
export const cupImg = '/img/wooden cup and sucer.jpeg';
export const logo = '/img/LOGO_BIG.png';
export const denner123 = '/img/dinner set 123.jpeg';
export const bowl123 = '/img/cerabowl.jpeg';

export const categories = [
    { id: 'ceramics', name: 'Ceramics', imageUrl: nutsImg },
    { id: 'dinnerware', name: 'Dinnerware', imageUrl: canisterImg },
    { id: 'cups', name: 'Cups', imageUrl: cupImg },
    { id: 'serving', name: 'Serving', imageUrl: cutleryImg },
    { id: 'trays', name: 'Trays', imageUrl: kettleImg },
    { id: 'jugs', name: 'Jugs', imageUrl: jugImg },
    { id: 'plates', name: 'Plates', imageUrl: nutsImg },
    { id: 'bowls', name: 'Bowls', imageUrl: canisterImg },
    { id: 'mugs', name: 'Mugs', imageUrl: cupImg },
    { id: 'sets', name: 'Sets', imageUrl: cutleryImg },
    { id: 'storage', name: 'Storage', imageUrl: kettleImg },
    { id: 'gifts', name: 'Gifts', imageUrl: jugImg },
    { id: 'decor', name: 'Decor', imageUrl: nutsImg },
    { id: 'kitchen', name: 'Kitchen', imageUrl: canisterImg },
    { id: 'accessories', name: 'Accessories', imageUrl: cupImg },
    { id: 'essentials', name: 'Essentials', imageUrl: cutleryImg }
];

export const products = [
    {
        id: '1',
        name: 'Ceramic Bowl',
        description: 'Beautiful handcrafted ceramic bowl perfect for serving',
        mrp: 30.05,
        price: 25.05,
        imageUrl: bowl123,
        imageUrls: [canisterImg, cutleryImg, jugImg],
        category: 'ceramics',
        details: {
            material: 'High-grade ceramic',
            dimensions: { length: '8"', width: '8"', height: '3"' },
            volume: '500ml',
            colors: ['White', 'Cream', 'Light Blue'],
            stock: 25,
            weight: '0.8 lbs',
            care: 'Dishwasher safe, microwave safe'
        }
    },
    {
        id: '2',
        name: 'Dinner Plate Set',
        description: 'Set of 4 elegant dinner plates',
        mrp: 59.99,
        price: 49.99,
        imageUrl: canisterImg,
        imageUrls: [canisterImg, denner123, nutsImg],
        category: 'dinnerware',
        details: {
            material: 'Fine porcelain',
            dimensions: { diameter: '10.5"', height: '1"' },
            volume: 'N/A',
            colors: ['White', 'Ivory'],
            stock: 15,
            weight: '2.5 lbs (set)',
            care: 'Dishwasher safe, oven safe up to 350°F'
        }
    },
    {
        id: '3',
        name: 'Tea Cup',
        description: 'Delicate porcelain tea cup with handle',
        mrp: 17.99,
        price: 12.99,
        imageUrl: cupImg,
        imageUrls: [cupImg, cupImg, jugImg],
        category: 'cups',
        details: {
            material: 'Premium porcelain',
            dimensions: { diameter: '3.5"', height: '3.5"' },
            volume: '8oz',
            colors: ['White', 'Floral Pattern'],
            stock: 30,
            weight: '0.6 lbs',
            care: 'Hand wash recommended'
        }
    },
    {
        id: '4',
        name: 'Serving Platter',
        description: 'Large serving platter for special occasions',
        mrp: 69.99,
        price: 59.99,
        imageUrl: cutleryImg,
        imageUrls: [cutleryImg, canisterImg, kettleImg],
        category: 'serving',
        details: {
            material: 'Ceramic with gold rim',
            dimensions: { length: '14"', width: '10"', height: '1.5"' },
            volume: 'N/A',
            colors: ['White with gold trim'],
            stock: 8,
            weight: '3.2 lbs',
            care: 'Hand wash only'
        }
    },
    {
        id: '5',
        name: 'Soup Bowl',
        description: 'Deep soup bowl with beautiful glaze',
        mrp: 19.99,
        price: 15.99,
        imageUrl: kettleImg,
        imageUrls: [kettleImg, nutsImg, jugImg],
        category: 'bowls',
        details: {
            material: 'Stoneware',
            dimensions: { diameter: '7"', height: '3.5"' },
            volume: '16oz',
            colors: ['Blue glaze', 'Green glaze'],
            stock: 20,
            weight: '1.2 lbs',
            care: 'Dishwasher safe, microwave safe'
        }
    },
    {
        id: '6',
        name: 'Coffee Mug Set',
        description: 'Set of 2 cozy coffee mugs',
        mrp: 29.99,
        price: 22.99,
        imageUrl: jugImg,
        imageUrls: [jugImg, cupImg, cutleryImg],
        category: 'mugs',
        details: {
            material: 'Ceramic',
            dimensions: { diameter: '3.5"', height: '4"' },
            volume: '12oz each',
            colors: ['White', 'Black', 'Blue'],
            stock: 18,
            weight: '1.8 lbs (set)',
            care: 'Dishwasher safe, microwave safe'
        }
    },
    {
        id: '7',
        name: 'Ceramic Vase',
        description: 'Elegant ceramic vase for home decoration',
        mrp: 45.99,
        price: 38.99,
        imageUrl: nutsImg,
        imageUrls: [nutsImg, bowl123, canisterImg],
        category: 'decor',
        details: {
            material: 'Handcrafted ceramic',
            dimensions: { diameter: '4"', height: '12"' },
            volume: 'N/A',
            colors: ['White', 'Matte Black', 'Sage Green'],
            stock: 12,
            weight: '2.1 lbs',
            care: 'Dust with soft cloth'
        }
    },
    {
        id: '8',
        name: 'Kitchen Storage Jar',
        description: 'Large airtight storage jar for kitchen essentials',
        mrp: 24.99,
        price: 19.99,
        imageUrl: canisterImg,
        imageUrls: [canisterImg, jugImg, kettleImg],
        category: 'storage',
        details: {
            material: 'Glass with bamboo lid',
            dimensions: { diameter: '5"', height: '8"' },
            volume: '2 liters',
            colors: ['Clear glass'],
            stock: 22,
            weight: '1.5 lbs',
            care: 'Hand wash lid, glass is dishwasher safe'
        }
    },
    {
        id: '9',
        name: 'Gift Box Set',
        description: 'Beautiful gift box with assorted crockery items',
        mrp: 89.99,
        price: 74.99,
        imageUrl: cutleryImg,
        imageUrls: [cutleryImg, cupImg, canisterImg],
        category: 'gifts',
        details: {
            material: 'Mixed ceramics and porcelain',
            dimensions: { length: '12"', width: '10"', height: '6"' },
            volume: 'N/A',
            colors: ['Assorted'],
            stock: 6,
            weight: '5.5 lbs',
            care: 'Follow individual item care instructions'
        }
    },
    {
        id: '10',
        name: 'Serving Tray',
        description: 'Wooden serving tray with elegant design',
        mrp: 34.99,
        price: 28.99,
        imageUrl: kettleImg,
        imageUrls: [kettleImg, cutleryImg, bowl123],
        category: 'trays',
        details: {
            material: 'Bamboo wood',
            dimensions: { length: '16"', width: '12"', height: '1.5"' },
            volume: 'N/A',
            colors: ['Natural bamboo', 'Dark stained'],
            stock: 14,
            weight: '2.8 lbs',
            care: 'Wipe with damp cloth, oil occasionally'
        }
    },
    {
        id: '11',
        name: 'Water Jug',
        description: 'Premium water jug with spout and handle',
        mrp: 39.99,
        price: 32.99,
        imageUrl: jugImg,
        imageUrls: [jugImg, nutsImg, cupImg],
        category: 'jugs',
        details: {
            material: 'Glass with stainless steel handle',
            dimensions: { diameter: '4"', height: '10"' },
            volume: '2 liters',
            colors: ['Clear glass'],
            stock: 16,
            weight: '2.2 lbs',
            care: 'Hand wash recommended'
        }
    },
    {
        id: '12',
        name: 'Dessert Plate Set',
        description: 'Set of 6 dessert plates with floral pattern',
        mrp: 49.99,
        price: 41.99,
        imageUrl: nutsImg,
        imageUrls: [nutsImg, canisterImg, cutleryImg],
        category: 'plates',
        details: {
            material: 'Porcelain',
            dimensions: { diameter: '8"', height: '0.8"' },
            volume: 'N/A',
            colors: ['White with floral pattern'],
            stock: 10,
            weight: '3.8 lbs (set)',
            care: 'Dishwasher safe'
        }
    },
    {
        id: '13',
        name: 'Kitchen Utensil Set',
        description: 'Essential kitchen utensils and accessories',
        mrp: 29.99,
        price: 24.99,
        imageUrl: cupImg,
        imageUrls: [cupImg, kettleImg, jugImg],
        category: 'kitchen',
        details: {
            material: 'Bamboo and stainless steel',
            dimensions: { length: '12"', width: '4"', height: '2"' },
            volume: 'N/A',
            colors: ['Natural bamboo'],
            stock: 19,
            weight: '1.2 lbs',
            care: 'Hand wash, dry thoroughly'
        }
    },
    {
        id: '14',
        name: 'Table Accessories',
        description: 'Table setting accessories and coasters',
        mrp: 19.99,
        price: 15.99,
        imageUrl: cutleryImg,
        imageUrls: [cutleryImg, nutsImg, bowl123],
        category: 'accessories',
        details: {
            material: 'Cork and bamboo',
            dimensions: { diameter: '4"', height: '0.5"' },
            volume: 'N/A',
            colors: ['Natural cork', 'Bamboo pattern'],
            stock: 28,
            weight: '0.8 lbs (set of 6)',
            care: 'Wipe clean'
        }
    },
    {
        id: '15',
        name: 'Essential Bowl Set',
        description: 'Basic bowl set for everyday use',
        mrp: 25.99,
        price: 21.99,
        imageUrl: canisterImg,
        imageUrls: [canisterImg, cutleryImg, cupImg],
        category: 'essentials',
        details: {
            material: 'Stoneware',
            dimensions: { diameter: '6"', height: '2.5"' },
            volume: '24oz',
            colors: ['White', 'Gray'],
            stock: 24,
            weight: '2.1 lbs (set of 4)',
            care: 'Dishwasher safe, microwave safe'
        }
    },
    {
        id: '16',
        name: 'Ceramic Dinner Set',
        description: 'Complete dinner set for 4 people',
        mrp: 149.99,
        price: 124.99,
        imageUrl: nutsImg,
        imageUrls: [nutsImg, bowl123, canisterImg],
        category: 'sets',
        details: {
            material: 'Premium porcelain',
            dimensions: { plates: '10.5"', bowls: '7"' },
            volume: 'N/A',
            colors: ['White', 'Cream'],
            stock: 5,
            weight: '12 lbs',
            care: 'Dishwasher safe, oven safe'
        }
    },
    {
        id: '17',
        name: 'Ceramic Dinner Set',
        description: 'Complete dinner set for 4 people',
        mrp: 149.99,
        price: 124.99,
        imageUrl: nutsImg,
        imageUrls: [nutsImg, canisterImg, cupImg],
        category: 'sets',
        details: {
            material: 'Premium porcelain',
            dimensions: { plates: '10.5"', bowls: '7"' },
            volume: 'N/A',
            colors: ['White', 'Cream'],
            stock: 5,
            weight: '12 lbs',
            care: 'Dishwasher safe, oven safe'
        }
    },
    {
        id: '18',
        name: 'Ceramic bowl 123',
        description: '3 layer remic bowl',
        mrp: 149.99,
        price: 124.99,
        imageUrl: nutsImg,
        imageUrls: [nutsImg, bowl123, canisterImg],

            colors: ['White', 'Cream'],
            stock: 5,
            weight: '12 lbs',
            care: 'Dishwasher safe, oven safe'
        },
    
    {
        id: '18',
        name: 'Ceramic bowl 123',
        description: '3 layer remic bowl',
        mrp: 149.99,
        price: 124.99,
        imageUrl: nutsImg,
        category: 'ceramics',
        details: {
            material: 'High-grade ceramic',
            dimensions: { length: '8"', width: '8"', height: '3"' },
            volume: '500ml',
            colors: ['White', 'Cream', 'Light Blue'],
            stock: 25,
            weight: '0.8 lbs',
            care: 'Dishwasher safe, microwave safe'
        }
    }
];