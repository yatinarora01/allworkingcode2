const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const EventEmitter = require('events');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Ensure this is present to load environment variables
const app = express();
const port = 3000;
const path = require('path');

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Welcome to the Autofill Shopping Cart API!');
});


let products = [];

// Event emitter for sending updates
const productUpdateEmitter = new EventEmitter();

app.post('/add-item', (req, res) => {
    const { name, price, weight } = req.body;
    const existingProduct = products.find(product => product.name === name);
    if (existingProduct) {
        return res.status(400).json({ message: 'Product already exists in the cart.' });
    }

    const newProduct = { name, price, weight };
    products.push(newProduct);
    
    // Emit an event to notify about the new product
    productUpdateEmitter.emit('productUpdated', products);

    return res.status(200).json({ message: 'Product added successfully.', products });
});

app.post('/delete-item', (req, res) => {
    const { name } = req.body;
    const productIndex = products.findIndex(product => product.name === name);

    if (productIndex !== -1) {
        products.splice(productIndex, 1); // Remove the product
        productUpdateEmitter.emit('productUpdated', products); // Emit the update event

        return res.status(200).json({ message: 'Product deleted successfully.', products });
    }
    
    return res.status(404).json({ message: 'Product not found.' });
});


app.get('/items', (req, res) => {
    res.status(200).json(products);
});

// SSE endpoint to send product updates
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Function to send the current product list
    const sendProducts = () => {
        res.write(`data: ${JSON.stringify(products)}\n\n`);
    };

    // Emit the current product list initially
    sendProducts();

    // Listen for product updates
    productUpdateEmitter.on('productUpdated', sendProducts);

    // Clean up when the connection is closed
    req.on('close', () => {
        productUpdateEmitter.off('productUpdated', sendProducts);
        res.end();
    });
});

// POST endpoint to generate QR code
app.post('/generate-qr', async (req, res) => {
    const { name, phone, totalAmount } = req.body;

    if (!name || !phone || !totalAmount) {
        return res.status(400).json({ message: 'Name, phone, and total amount are required.' });
    }

    // Create a URL for payment confirmation
    // Create a URL for payment success confirmation
const paymentConfirmationUrl = `https://new-backend-production-3b02.up.railway.app/payment-success.html?name=${encodeURIComponent(name)}&totalAmount=${totalAmount}`;

    try {
        // Generate QR code with the payment confirmation URL
        const qrCodeUrl = await QRCode.toDataURL(paymentConfirmationUrl); 

        // Send QR code URL back to the client
        res.status(200).json({ qrCodeUrl });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ message: 'Failed to generate QR code.' });
    }
});

// POST endpoint to send the bill
app.post('/send-bill', async (req, res) => {
    const { email, name, products, totalAmount } = req.body;

    console.log("SMTP_USER:", process.env.SMTP_USER);
    console.log("SMTP_PASS:", process.env.SMTP_PASS);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.hostinger.com',
        port: process.env.SMTP_PORT || 465,
        secure: true, // use SSL
        auth: {
            user: process.env.SMTP_USER || 'yatin.arora@syncwavecom.com',  // Hostinger email
            pass: process.env.SMTP_PASS || 'Y@tin123', // Password for the Hostinger email
        }
    });

    // Generate the email content
    let productDetails = Array.isArray(products) ? products.map(product => `${product.name} - ₹${product.price}`).join('\n') : 'No products available';
    const paymentLink = `https://new-backend-production-3b02.up.railway.app/confirm-payment?email=${encodeURIComponent(email)}`;
    const mailOptions = {
        from: process.env.SMTP_USER || 'yatin.arora@syncwavecom.com', // Hostinger email
        to: email,
        subject: 'Smart Wiz Bill',
        text: `Hello ${name},\n\nHere is your bill:\n\n${productDetails}\n\nTotal: ₹${totalAmount}\n\nThank you for shopping with us!\n\nClick the link to confirm your payment: ${paymentLink}`
    };

    try {
        // Send the email
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Bill sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        console.log('Mail options:', mailOptions); // Log the mail options to see if everything is correct
        res.status(500).json({ message: 'Failed to send bill' });
    }
});

// New endpoint to confirm payment
app.get('/confirm-payment', (req, res) => {
    const { email } = req.query;
    // Render a simple thank you message
    res.send(`
        <html>
        <body>
            <h1>Thank You for Your Payment!</h1>
            <p>Your payment has been successfully processed. An email confirmation has been sent to ${email}.</p>
        </body>
        </html>
    `);
});
app.get('/payment-confirmation', (req, res) => {
    const { name, totalAmount } = req.query;
    
    const html = `
        <html>
        <head>
            <title>Payment Confirmation</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f8f9fa;
                    text-align: center;
                    margin-top: 50px;
                }
                h1 {
                    color: green;
                }
            </style>
        </head>
        <body>
            <h1>Payment Done</h1>
            <p>Thank you, ${name}!</p>
            <p>Your payment of ₹${totalAmount} has been successfully completed.</p>
        </body>
        </html>
    `;
    res.send(html);
});


// Serve payment-success.html from the root directory
app.get('/payment-success.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'payment-success.html'));
});

app.use(express.static(__dirname + '/'));


app.listen(port, () => {
    console.log(`Backend server is running on port ${port}`);
});