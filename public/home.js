document.addEventListener('DOMContentLoaded', function () {

  // ✅ Handle "Login as Host" button
  const hostBtn = document.querySelector('.host_button');
  if (hostBtn) {
    hostBtn.addEventListener('click', () => {
      window.location.href = '/host-login';
    });
  }

  // ✅ Handle "Check Cart" button
  const cartBtn = document.querySelector('.cart_button');
  if (cartBtn) {
    cartBtn.addEventListener('click', () => {
      window.location.href = '/cart';
    });
  }

  // ✅ Handle all "Add to Cart" buttons
  document.querySelectorAll('.add_to_cart').forEach(button => {
    button.addEventListener('click', async function () {
      const productId = this.getAttribute('data-product-id');

      try {
        const res = await fetch('/add-to-cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // ✅ FIX: only send productId — user_id comes from session on the server
          body: JSON.stringify({ productId: productId })
        });

        // ✅ FIX: backend now returns JSON so we parse as json
        const data = await res.json();

        if (res.ok) {
          alert(data.message || 'Added to cart!');
        } else {
          alert(data.message || 'Failed to add to cart.');
        }

      } catch (error) {
        console.error('Error adding to cart:', error);
        alert('Something went wrong. Please try again.');
      }
    });
  });

});