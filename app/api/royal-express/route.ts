import { NextResponse } from "next/server";

const ROYAL_EXPRESS_API = "https://royalexpress.merchant.curfox.com/add-new-order";
const USERNAME = "stmart0001@gmail.com";
const PASSWORD = "-1996@Abc";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(ROYAL_EXPRESS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("RoyalExpress API error:", error);
    return NextResponse.json(
      { error: "Failed to submit to RoyalExpress" },
      { status: 500 }
    );
  }
}