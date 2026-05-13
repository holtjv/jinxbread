export default function ConfirmationPage() {
  return (
    <main style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px' }}>
      <h1>Order received</h1>
      <p>Thanks — your order has been submitted. You'll hear from us if anything changes.</p>
      <a href="/order" style={{ color: '#000' }}>Place another order</a>
    </main>
  )
}
