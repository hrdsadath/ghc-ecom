import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Seed products
    const products = [
        {
            name: 'Ceramic Plate',
            description: 'A beautiful ceramic plate for serving dishes.',
            price: 19.99,
            stock: 100,
        },
        {
            name: 'Glass Bowl',
            description: 'A stylish glass bowl for salads and snacks.',
            price: 15.49,
            stock: 50,
        },
        {
            name: 'Porcelain Mug',
            description: 'A classic porcelain mug for your favorite beverages.',
            price: 9.99,
            stock: 200,
        },
        {
            name: 'Stoneware Dish',
            description: 'Durable stoneware dish for baking and serving.',
            price: 25.00,
            stock: 30,
        },
    ];

    for (const product of products) {
        await prisma.product.create({
            data: product,
        });
    }

    console.log('Database seeded with initial products.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });