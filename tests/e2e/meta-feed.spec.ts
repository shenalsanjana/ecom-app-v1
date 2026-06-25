import { test, expect } from "@playwright/test";

test("catalog feed returns CSV with header and product rows", async ({ request }) => {
  const res = await request.get("/feed/meta-catalog.csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");

  const body = await res.text();
  const lines = body.trim().split("\n");
  expect(lines[0]).toBe(
    "id,title,description,availability,condition,price,sale_price,link,image_link,brand,google_product_category,item_group_id",
  );
  expect(lines.length).toBeGreaterThan(1);
  expect(body).toContain("LKR");
  expect(body).toContain("Dressing Bear");
});
