import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { X, CreditCard, Lock, FlaskConical } from 'lucide-react';

const publishableKey =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  'pk_test_51UJyO4DuIcZgJCzWbS7C5ufGCOofhWOxIqDa2xz14WcTnEVg3KflZpV10ikqRWBebmtCCBVku0exdzbDQ1Rlqi1e00lssNkToY';
const stripePromise = loadStripe(publishableKey);
const isTestMode = publishableKey.startsWith('pk_test_');

// Styles the real Stripe-hosted payment form to match the Flowly theme.
const APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#5C187B',
    colorText: '#201530',
    colorDanger: '#B23A2E',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '10px',
  },
};

const CheckoutForm = ({ amount, onSuccess, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [cardHolderName, setCardHolderName] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      // Stripe validates the form, runs the test-mode 3D Secure popup if the
      // card requires it, and only returns once the payment is settled.
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          payment_method_data: {
            billing_details: { name: cardHolderName || 'Flowly Customer' },
          },
        },
      });

      if (result.error) {
        setError(result.error.message || 'Payment failed. Please try again.');
        return;
      }

      const intent = result.paymentIntent;
      if (intent?.status === 'succeeded') {
        onSuccess(intent);
      } else {
        setError(`Payment is not complete yet (status: ${intent?.status}). Please try again.`);
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong while contacting Stripe.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '16px' }}>
        <label className="form-label" style={{ marginBottom: '6px' }}>Cardholder Name</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. John Doe"
          value={cardHolderName}
          onChange={(e) => setCardHolderName(e.target.value)}
          required
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {isTestMode && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: '#FFF7E6',
            border: '1px solid #F5D9A0',
            color: '#7A5200',
            fontSize: '12px',
            lineHeight: 1.5,
            marginBottom: '16px',
          }}
        >
          <strong>Stripe test mode:</strong> use card <code>4242 4242 4242 4242</code>, any future
          expiry and any CVC. For the 3D Secure window use <code>4000 0025 0000 3155</code>.
          No real money is charged.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: '#FADADA',
            color: '#B23A2E',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
          }}
        >
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6E677B', fontSize: '12px', marginBottom: '20px' }}>
        <Lock size={14} color="#059669" />
        Secure payment powered by Stripe
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button type="button" onClick={onClose} className="btn-outline-dark" style={{ flex: 1 }} disabled={processing}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
          style={{ flex: 1, backgroundColor: '#5C187B' }}
          disabled={!stripe || !elements || processing}
        >
          {processing ? 'Processing...' : `Pay ₹${amount?.toLocaleString('en-IN')}`}
        </button>
      </div>
    </form>
  );
};

const StripeCardModal = ({ isOpen, onClose, clientSecret, amount, title = 'Card Payment', onSuccess }) => {
  if (!isOpen) return null;

  const isMockSecret = !clientSecret || clientSecret.startsWith('mock_secret') || clientSecret.endsWith('_secret_mock');

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-container" style={{ maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#FAF5FF',
                color: '#5C187B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CreditCard size={20} />
            </div>
            <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#201530' }}>{title}</h3>
            {isTestMode && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#7A5200',
                  backgroundColor: '#FFF7E6',
                  border: '1px solid #F5D9A0',
                  borderRadius: '999px',
                  padding: '2px 8px',
                }}
              >
                <FlaskConical size={12} /> TEST MODE
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: '#FAF5FF',
            border: '1px solid #E9D8FD',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '13px', color: '#5C187B', fontWeight: 600 }}>Amount to Pay</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#5C187B' }}>
            ₹{amount?.toLocaleString('en-IN')}
          </span>
        </div>

        {isMockSecret ? (
          <div>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: '#FADADA',
                color: '#B23A2E',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '16px',
              }}
            >
              ⚠ The server did not return a real Stripe payment session, so the Stripe window
              can't be shown. Check that STRIPE_SECRET_KEY is set on the backend and restart it.
            </div>
            <button type="button" onClick={onClose} className="btn-outline-dark" style={{ width: '100%' }}>
              Close
            </button>
          </div>
        ) : (
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{ clientSecret, appearance: APPEARANCE }}
          >
            <CheckoutForm amount={amount} onSuccess={onSuccess} onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>
  );
};

export default StripeCardModal;