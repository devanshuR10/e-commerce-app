const express = require('express');
const pg = require('pg');
const bcrypt = require('bcrypt');

const userRouter = express.Router();

userRouter.use(express.urlencoded({ extended: true }));
userRouter.use(express.json());

const db = new pg.Client({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     process.env.DB_PORT
});

db.connect((err) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log("Connected to DB");
  }
});

function checkAuth(req, res, next) {
  if (req.session && req.session.user_id) {
    next();
  } else {
    res.redirect('/login-user');
  }
}

/* helper */
async function getUsername(userId) {
  const r = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
  return r.rows[0] ? r.rows[0].name : '';
}

/* =========================
   AUTH ROUTES
========================= */

userRouter.get('/signin-user', (req, res) => res.render('user-signup.ejs'));

userRouter.post('/signin-user', async (req, res) => {
  const { email, username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
      [username, email, hashedPassword]
    );
    res.redirect('/login-user');
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).send('Signup failed');
  }
});

userRouter.get('/login-user', (req, res) => res.render('user-login.ejs'));

userRouter.post('/login-user', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.send('User not found');
    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (passwordMatch) {
      req.session.user_id = user.id;
      res.redirect('/');
    } else {
      res.send('Invalid password');
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).send('Login failed');
  }
});

/* =========================
   HOME / SEARCH / PRODUCT
========================= */

userRouter.get('/', checkAuth, async (req, res) => {
  try {
    const productsResult = await db.query('SELECT * FROM products');
    const username = await getUsername(req.session.user_id);
    res.render('home.ejs', { products: productsResult.rows, username });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).send('Internal Server Error');
  }
});

userRouter.get('/search', checkAuth, async (req, res) => {
  const searchTerm = req.query.query;
  if (!searchTerm) return res.redirect('/');
  try {
    const productsResult = await db.query(
      'SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1',
      [`%${searchTerm}%`]
    );
    const username = await getUsername(req.session.user_id);
    res.render('home.ejs', { products: productsResult.rows, username });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).send('Search failed');
  }
});

userRouter.get("/info/:product_id", checkAuth, async (req, res) => {
  const product_id = parseInt(req.params.product_id);
  try {
    const product = await db.query(
      "SELECT * FROM products WHERE product_id = $1",
      [product_id]
    );
    res.render('product_info.ejs', { product: product.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading product');
  }
});

/* =========================
   CART
========================= */

userRouter.post('/add-to-cart', checkAuth, async (req, res) => {
  const productId = parseInt(req.body.productId);
  const userId = req.session.user_id;
  if (!productId) return res.status(400).json({ message: 'Invalid product ID' });

  try {
    let cart = await db.query('SELECT * FROM cart WHERE user_id = $1', [userId]);
    let cartId;

    if (cart.rows.length === 0) {
      const newCart = await db.query(
        'INSERT INTO cart (user_id) VALUES ($1) RETURNING cart_id',
        [userId]
      );
      cartId = newCart.rows[0].cart_id;
    } else {
      cartId = cart.rows[0].cart_id;
    }

    const existingItem = await db.query(
      'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2',
      [cartId, productId]
    );

    if (existingItem.rows.length > 0) {
      await db.query(
        'UPDATE cart_items SET quantity = quantity + 1 WHERE cart_id = $1 AND product_id = $2',
        [cartId, productId]
      );
    } else {
      await db.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, 1)',
        [cartId, productId]
      );
    }

    res.json({ message: 'Added to cart successfully!' });
  } catch (err) {
    console.error('Cart error:', err);
    res.status(500).json({ message: 'Failed to add to cart' });
  }
});

userRouter.get('/cart', checkAuth, async (req, res) => {
  const userId = req.session.user_id;
  try {
    const result = await db.query(`
      SELECT p.name AS item_name, p.price, p.product_id, ci.quantity
      FROM cart_items ci
      JOIN cart c     ON ci.cart_id    = c.cart_id
      JOIN products p ON ci.product_id = p.product_id
      WHERE c.user_id = $1
    `, [userId]);

    const username = await getUsername(userId);
    res.render('cart_check.ejs', { products: result.rows, username });
  } catch (err) {
    console.error(err);
    res.status(500).send('Cart load failed');
  }
});

userRouter.post('/cart/remove/:productId', checkAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  const userId = req.session.user_id;
  try {
    await db.query(`
      DELETE FROM cart_items
      WHERE product_id = $1
        AND cart_id IN (SELECT cart_id FROM cart WHERE user_id = $2)
    `, [productId, userId]);
    res.redirect('/cart');
  } catch (err) {
    console.error(err);
    res.status(500).send('Remove failed');
  }
});

/* =========================
   CHECKOUT — show form + order summary
========================= */

userRouter.get('/cart/checkout/:username', checkAuth, async (req, res) => {
  const userId = req.session.user_id;
  try {
    const result = await db.query(`
      SELECT p.name AS item_name, p.price, p.product_id, ci.quantity
      FROM cart_items ci
      JOIN cart c     ON ci.cart_id    = c.cart_id
      JOIN products p ON ci.product_id = p.product_id
      WHERE c.user_id = $1
    `, [userId]);

    if (result.rows.length === 0) return res.redirect('/cart');

    res.render('checkout.ejs', {
      products: result.rows,
      username: req.params.username
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Checkout failed');
  }
});

/* =========================
   PLACE ORDER
   - saves address → addresses table
   - creates row  → orders table
   - saves items  → order_items table
   - clears cart
   - renders order_confirmed.ejs
========================= */

userRouter.post('/cart/place-order', checkAuth, async (req, res) => {
  const userId = req.session.user_id;
  const { full_name, full_address, city, state, pincode, country, payment } = req.body;

  try {
    /* 1. fetch cart items */
    const cartResult = await db.query(`
      SELECT p.name AS item_name, p.price, p.product_id, ci.quantity
      FROM cart_items ci
      JOIN cart c     ON ci.cart_id    = c.cart_id
      JOIN products p ON ci.product_id = p.product_id
      WHERE c.user_id = $1
    `, [userId]);

    if (cartResult.rows.length === 0) return res.redirect('/cart');

    /* 2. calculate total */
    let total = 0;
    cartResult.rows.forEach(item => {
      total += Number(item.price) * Number(item.quantity);
    });

    /* 3. save address */
    await db.query(
      `INSERT INTO addresses (user_id, full_address, city, state, pincode, country)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, full_address, city, state, pincode, country || 'India']
    );

    /* 4. create order — orders table has: order_id, user_id, total_amount, status, created_at */
    const orderResult = await db.query(
      `INSERT INTO orders (user_id, total_amount, status)
       VALUES ($1, $2, 'confirmed')
       RETURNING order_id`,
      [userId, total.toFixed(2)]
    );
    const orderId = orderResult.rows[0].order_id;

    /* 5. insert order_items — columns: id, order_id, product_id, quantity, price_at_time */
    for (const item of cartResult.rows) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price_at_time)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    /* 6. clear cart */
    const cartRow = await db.query(
      'SELECT cart_id FROM cart WHERE user_id = $1',
      [userId]
    );
    if (cartRow.rows.length > 0) {
      await db.query(
        'DELETE FROM cart_items WHERE cart_id = $1',
        [cartRow.rows[0].cart_id]
      );
    }

    /* 7. render confirmation */
    const paymentLabels = {
      cod:        'Cash on Delivery',
      upi:        'UPI',
      card:       'Credit / Debit Card',
      netbanking: 'Net Banking'
    };

    const displayAddress = `${full_address}, ${city}, ${state} - ${pincode}, ${country || 'India'}`;

    res.render('order_confirmed.ejs', {
      username: full_name,
      orderId:  orderId,
      address:  displayAddress,
      payment:  paymentLabels[payment] || payment,
      total:    total.toFixed(2)
    });

  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).send('Failed to place order: ' + err.message);
  }
});

/* =========================
   LOGOUT
========================= */

userRouter.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login-user'));
});

module.exports = userRouter;