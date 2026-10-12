const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateTotals,
  canTransitionOrder,
  normalizeShippingAddress,
} = require("../services/orderService");

test("calculateTotals applies the flat delivery fee below the threshold", () => {
  assert.deepEqual(
    calculateTotals([{ price: 1200, quantity: 2 }], {
      freeShippingThreshold: 5000,
      flatShippingFee: 120,
    }),
    { subtotal: 2400, shippingFee: 120, totalAmount: 2520 }
  );
});

test("calculateTotals makes delivery free at the configured threshold", () => {
  assert.deepEqual(
    calculateTotals([{ price: 2500, quantity: 2 }], {
      freeShippingThreshold: 5000,
      flatShippingFee: 120,
    }),
    { subtotal: 5000, shippingFee: 0, totalAmount: 5000 }
  );
});

test("normalizeShippingAddress trims fields and validates the phone", () => {
  assert.deepEqual(
    normalizeShippingAddress({
      line1: " 12 Lake Road ",
      city: " Dhaka ",
      district: " Dhaka ",
      postCode: " 1205 ",
      phone: " +880 1712-345678 ",
    }),
    {
      line1: "12 Lake Road",
      line2: "",
      city: "Dhaka",
      district: "Dhaka",
      postCode: "1205",
      country: "Bangladesh",
      phone: "+880 1712-345678",
    }
  );
  assert.throws(
    () => normalizeShippingAddress({ line1: "Road", city: "Dhaka" }),
    /Shipping address is incomplete/
  );
});

test("order transitions only move forward or cancel before shipment", () => {
  assert.equal(canTransitionOrder("pending", "processing"), true);
  assert.equal(canTransitionOrder("processing", "cancelled"), true);
  assert.equal(canTransitionOrder("shipped", "cancelled"), false);
  assert.equal(canTransitionOrder("delivered", "processing"), false);
  assert.equal(canTransitionOrder("pending", "pending"), true);
});

test("Totals reject non-finite and unsafe order amounts", () => {
  assert.throws(() => calculateTotals([{ price: 1e300, quantity: 10 }]), /supported range/);
});
