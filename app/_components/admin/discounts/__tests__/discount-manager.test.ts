import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0, transition: Promise.resolve(),
  refresh: vi.fn(), save: vi.fn(), active: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original,
    useState: (initial: unknown) => {
      const index = mock.cursor++;
      if (!(index in mock.states)) mock.states[index] = initial;
      return [mock.states[index], (next: unknown) => { mock.states[index] = next; }];
    },
    useTransition: () => [false, (action: () => Promise<void>) => { mock.transition = Promise.resolve(action()); }],
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock("@/app/admin/discounts/actions", () => ({ saveDiscount: mock.save, setDiscountActive: mock.active, deleteDiscount: mock.remove }));

import { DiscountManager, type DiscountRow } from "../discount-manager";
import { Dialog } from "@/components/ui/dialog";

type Element = { type: unknown; props: Record<string, unknown> };
function findAll(node: unknown, predicate: (element: Element) => boolean): Element[] {
  const queue: unknown[] = [node], found: Element[] = [];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) { queue.push(...current); continue; }
    if (!current || typeof current !== "object" || !("props" in current)) continue;
    const element = current as Element;
    if (predicate(element)) found.push(element);
    queue.push(element.props.children);
  }
  return found;
}
function find(node: unknown, predicate: (element: Element) => boolean): Element {
  const element = findAll(node, predicate)[0];
  if (!element) throw new Error("Expected control not found");
  return element;
}
function click(element: Element) { (element.props.onClick as () => void)(); }
function change(element: Element, value: string) { (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); }
function submit(tree: unknown) { (find(tree, el => el.type === "form").props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault() {} }); }
const asOf = Date.parse("2026-10-21T12:00:00Z");
const offer = (overrides: Partial<DiscountRow> = {}): DiscountRow => ({
  id: "offer", version: 7, name: "Tote sale", code: "TOTE10", type: "PERCENTAGE", scope: "STORE", value: 10, active: true,
  startsAt: null, expiresAt: null, usageLimit: 20, minimumOrder: 1000, maximumDiscount: 500,
  productIds: [], categorySlugs: [], usedCount: 5, savings: 1500, paidOrders: 3, ...overrides,
});
let rows: DiscountRow[];
function render() {
  mock.cursor = 0;
  return DiscountManager({ rows, asOf, products: [{ id: "tote", name: "Canvas tote" }], categories: [{ id: "bags", name: "Accessories / Bags" }], totals: { active: 1, uses: 5, savings: 1500, paid: 3 } });
}
function control(tree: unknown, id: string) { return find(tree, el => el.props.id === id || el.props["aria-label"] === id); }
function editOffer() { click(control(render(), "Edit Tote sale")); }
function dialogs(tree: unknown) { return findAll(tree, el => el.type === Dialog); }
function offerCount(tree: unknown) { return findAll(tree, el => el.type === "article").length; }

beforeEach(() => {
  vi.clearAllMocks(); mock.states = []; mock.cursor = 0; mock.transition = Promise.resolve(); rows = [offer()];
  mock.save.mockResolvedValue({ success: true }); mock.active.mockResolvedValue({ success: true }); mock.remove.mockResolvedValue({ success: true });
});

describe("admin discount management", () => {
  it("edits multiple payment methods, rejects no selection, and restores All explicitly", async () => {
    editOffer();
    const check = (id: string, checked: boolean) => (control(render(), id).props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked } });
    expect(control(render(), "offer-payments-all").props.checked).toBe(true);
    check("offer-payment-PAYHERE", true);
    check("offer-payment-KOKO", true);
    expect(control(render(), "offer-payments-all").props.checked).toBe(false);
    submit(render()); await mock.transition;
    expect(mock.save).toHaveBeenLastCalledWith("offer", 7, expect.objectContaining({ paymentMethods: ["PAYHERE", "KOKO"] }));
    editOffer();
    check("offer-payments-all", false);
    mock.save.mockClear(); submit(render());
    expect(mock.save).not.toHaveBeenCalled();
    expect(find(render(), el => el.props.role === "alert").props.children).toBe("Select at least one payment method.");
    check("offer-payments-all", true);
    submit(render()); await mock.transition;
    expect(mock.save).toHaveBeenLastCalledWith("offer", 7, expect.objectContaining({ paymentMethods: ["ALL"] }));
  });
  it("combines case-insensitive search, status and offer-type filters", () => {
    rows = [offer(), offer({ id: "automatic", code: "", name: "Tote automatic" }), offer({ id: "scheduled", startsAt: "2026-10-22T00:00:00Z" })];
    change(control(render(), "Search offers"), "  tote  ");
    change(control(render(), "Filter offers by type"), "coupon");
    expect(offerCount(render())).toBe(2);
    change(control(render(), "Filter offers by status"), "Active");
    expect(offerCount(render())).toBe(1);
    change(control(render(), "Search offers"), "missing");
    expect(offerCount(render())).toBe(0);
    click(find(render(), el => el.props.children === "Clear filters"));
    expect(offerCount(render())).toBe(3);
  });

  it("handles inclusive starts, exclusive expiry and exhausted usage in status filters", () => {
    rows = [offer({ startsAt: new Date(asOf).toISOString() }), offer({ id: "expired", expiresAt: new Date(asOf).toISOString() }), offer({ id: "used", usedCount: 20 })];
    for (const status of ["Active", "Expired", "Limit reached"]) {
      change(control(render(), "Filter offers by status"), status);
      expect(offerCount(render())).toBe(1);
    }
  });

  it("creates a normalized coupon using Sri Lanka schedule times", async () => {
    click(find(render(), el => Array.isArray(el.props.children) && el.props.children.includes("Create offer")));
    change(control(render(), "offer-name"), "Weekend sale");
    change(control(render(), "offer-code"), " weekend ");
    change(control(render(), "startsAt"), "2026-10-22T10:00");
    change(control(render(), "expiresAt"), "2026-10-23T10:00");
    submit(render()); await mock.transition;
    expect(mock.save).toHaveBeenCalledWith(null, null, expect.objectContaining({ code: "WEEKEND", name: "Weekend sale", active: false, startsAt: "2026-10-22T04:30:00.000Z", expiresAt: "2026-10-23T04:30:00.000Z" }));
    expect(dialogs(render())[0].props.open).toBe(false);
    expect(mock.refresh).toHaveBeenCalledOnce();
  });

  it("keeps an incomplete date editable and rejects it without a server request", () => {
    editOffer();
    expect(() => change(control(render(), "startsAt"), "2026-10-")).not.toThrow();
    expect(control(render(), "startsAt").props.value).toBe("2026-10-");
    submit(render());
    expect(mock.save).not.toHaveBeenCalled();
    expect(find(render(), el => el.props.role === "alert").props.children).toBe("Enter valid start and expiry dates.");
  });

  it("rejects expiry before the start while retaining the form", () => {
    editOffer();
    change(control(render(), "startsAt"), "2026-10-23T10:00");
    change(control(render(), "expiresAt"), "2026-10-22T10:00");
    submit(render());
    expect(mock.save).not.toHaveBeenCalled();
    expect(find(render(), el => el.props.role === "alert").props.children).toBe("Expiry must be after the start date");
    expect(dialogs(render())[0].props.open).toBe(true);
  });

  it("preserves exact unedited dates and the version seen when editing began", async () => {
    rows = [offer({ startsAt: "2026-10-21T11:00:35.123Z" })];
    editOffer();
    expect(control(render(), "startsAt").props.value).toBe("2026-10-21T16:30");
    rows = [offer({ version: 8, usedCount: 6 })];
    submit(render()); await mock.transition;
    expect(mock.save).toHaveBeenCalledWith("offer", 7, expect.objectContaining({ startsAt: "2026-10-21T11:00:35.123Z" }));
  });

  it("lets an admin remove archived targets even when a search hides them", async () => {
    rows = [offer({ scope: "PRODUCTS", productIds: ["archived", "tote"] })];
    editOffer();
    change(control(render(), "Search offer targets"), "does not match");
    expect(find(render(), el => el.props.type === "submit").props.disabled).toBe(true);
    click(control(render(), "Remove archived"));
    expect(find(render(), el => el.props.type === "submit").props.disabled).toBe(false);
    expect(control(render(), "Remove Canvas tote")).toBeDefined();
    submit(render()); await mock.transition;
    expect(mock.save).toHaveBeenCalledWith("offer", 7, expect.objectContaining({ productIds: ["tote"] }));
  });

  it("retains the draft and displays a rejected save", async () => {
    mock.save.mockResolvedValue({ success: false, error: "That coupon code is already in use." });
    editOffer();
    change(control(render(), "offer-name"), "Updated sale");
    submit(render()); await mock.transition;
    expect(dialogs(render())[0].props.open).toBe(true);
    expect(control(render(), "offer-name").props.value).toBe("Updated sale");
    expect(find(render(), el => el.props.role === "alert").props.children).toBe("That coupon code is already in use.");
    expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });

  it("shows activation errors in the page and uses the displayed version", async () => {
    mock.active.mockResolvedValue({ success: false, error: "This offer changed. Refresh and try again." });
    click(control(render(), "Deactivate Tote sale")); await mock.transition;
    expect(mock.active).toHaveBeenCalledWith("offer", 7, false);
    expect(find(render(), el => el.props.role === "alert").props.children).toContain("offer changed");
    expect(mock.success).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before deleting an offer", async () => {
    click(control(render(), "Delete Tote sale"));
    expect(dialogs(render())[1].props.open).toBe(true);
    expect(mock.remove).not.toHaveBeenCalled();
    const dialog = dialogs(render())[1];
    click(find(dialog, el => el.props.children === "Delete offer")); await mock.transition;
    expect(mock.remove).toHaveBeenCalledWith("offer", 7);
    expect(dialogs(render())[1].props.open).toBe(false);
    expect(mock.success).toHaveBeenCalledWith("Offer deleted");
  });
});
