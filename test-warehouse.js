#!/usr/bin/env node
/**
 * Test script to debug Shopify warehouse assignment
 */

const testShopifyWarehouse = async () => {
  console.log("🧪 Testing Shopify warehouse assignment...");
  
  const testConfig = {
    warehouse: "om-bbh",
    address: "us-residential",
    lineItems: [{ productId: "test-product", quantity: 1 }],
    customerFirstName: "Test",
    customerLastName: "User",
    customerEmail: "test@example.com",
    subscriptionType: "one-time",
    customerSegment: "new",
    customTags: ["test"],
    addressTemplate: "standard",
    orderCount: 1,
    orderDelay: 0,
    skuTemplate: "default",
    stateProvince: "NY"
  };

  console.log("📋 Test configuration:", JSON.stringify(testConfig, null, 2));

  try {
    // Test order creation endpoint
    const response = await fetch('http://localhost:5000/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: testConfig,
        batchId: `TEST-${Date.now()}`
      })
    });

    const result = await response.json();
    console.log("🎯 API Response:", JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("✅ Order created successfully!");
      console.log("📦 Order ID:", result.orderId);
    } else {
      console.log("❌ Order creation failed:", result.error);
    }

  } catch (error) {
    console.error("🚨 Test failed:", error.message);
  }
};

// Test different warehouse assignment approaches
const testWarehouseApproaches = async () => {
  console.log("\n🔬 Testing different Shopify API approaches...");
  
  // Test 1: Check available locations
  console.log("\n1️⃣ Testing location lookup...");
  try {
    const response = await fetch('http://localhost:5000/api/orders/test-locations', {
      method: 'GET'
    });
    if (response.ok) {
      const locations = await response.json();
      console.log("🏪 Available locations:", locations);
    }
  } catch (error) {
    console.log("❌ Location test not available");
  }

  // Test 2: Run warehouse assignment test
  console.log("\n2️⃣ Testing warehouse assignment...");
  await testShopifyWarehouse();
};

// Run the tests
if (require.main === module) {
  testWarehouseApproaches().catch(console.error);
}

module.exports = { testShopifyWarehouse, testWarehouseApproaches };