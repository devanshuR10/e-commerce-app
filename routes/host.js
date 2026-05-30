const express = require('express');
const bcrypt = require('bcrypt');
const pg = require('pg');

const hostRouter = express.Router();

hostRouter.use(express.urlencoded({ extended: true }));
hostRouter.use(express.json());

const db = new pg.Client({
    user: 'postgres',
    host: 'localhost',
    database: 'e commers',
    password: '1234',
    port: 5432
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err.stack);
    } else {
        console.log('Connected to database');
    }
});

/* =========================
   AUTH MIDDLEWARE
========================= */
function checkHostAuth(req, res, next) {
    if (req.session && req.session.host_email) {
        next();
    } else {
        res.redirect('/host-login');
    }
}

/* =========================
   GET ROUTES
========================= */

hostRouter.get('/host-login', (req, res) => {
    res.render('host_login.ejs');
});

// ✅ FIX: was 'host-signup.ejs' (dash) — must match actual filename host_signup.ejs (underscore)
hostRouter.get('/host-signup', (req, res) => {
    res.render('host_signup.ejs');
});

hostRouter.get('/host', checkHostAuth, (req, res) => {
    res.render('host.ejs');
});

/* =========================
   HOST SIGNUP
========================= */
hostRouter.post('/host-signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send('Email and password are required');
        }

        const existing = await db.query(
            'SELECT * FROM host_info WHERE email = $1',
            [email]
        );
        if (existing.rows.length > 0) {
            return res.status(400).send('Email already registered. <a href="/host-login">Log in</a>');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO host_info (name, email, password) VALUES ($1, $2, $3)',
            [name || '', email, hashedPassword]
        );

        console.log('Host signed up:', email);
        res.redirect('/host-login');

    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).send('Signup failed. Please try again.');
    }
});

/* =========================
   HOST LOGIN
========================= */
hostRouter.post('/host-login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send('Email and password are required');
        }

        const result = await db.query(
            'SELECT * FROM host_info WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).send('User not found. <a href="/host-signup">Sign up</a>');
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).send('Invalid password');
        }

        req.session.host_email = email;
        req.session.host_name = user.name || email;

        res.redirect('/host');

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send('Login failed');
    }
});

/* =========================
   ADD PRODUCT
========================= */
hostRouter.post('/host', checkHostAuth, async (req, res) => {
    try {
        const { price, sellerName, itemName, description } = req.body;
        const email = req.session.host_email;

        if (!itemName || !price) {
            return res.status(400).send('Item name and price are required');
        }

        const hostResult = await db.query(
            'SELECT id FROM host_info WHERE email = $1',
            [email]
        );

        if (hostResult.rows.length === 0) {
            return res.status(401).send('Host not found. Please log in again.');
        }

        const hostId = hostResult.rows[0].id;

        await db.query(
            `INSERT INTO products (name, description, price, stock, created_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [itemName, description || '', parseFloat(price), 1, hostId]
        );

        res.render('uploaded_successfully.ejs', {
            username: sellerName,
            itemName: itemName,
            price: parseFloat(price).toFixed(2)
        });

    } catch (err) {
        console.error('Product upload error:', err);
        res.status(500).send('Failed to upload product: ' + err.message);
    }
});

/* =========================
   HOST LOGOUT
========================= */
hostRouter.get('/host-logout', (req, res) => {
    // ✅ FIX: delete session keys properly — setting to null keeps session alive
    delete req.session.host_email;
    delete req.session.host_name;
    res.redirect('/host-login');
});

module.exports = hostRouter;