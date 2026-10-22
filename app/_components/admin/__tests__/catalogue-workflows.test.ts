import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, transition: Promise.resolve(), refresh: vi.fn(), push: vi.fn(), createCategory: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), unpublishProduct: vi.fn() }));
vi.mock("react", async importOriginal => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original,
    useState: (initial: unknown) => {
      const index = mock.cursor++;
      if (!(index in mock.states)) mock.states[index] = initial;
      return [mock.states[index], (next: unknown) => { mock.states[index] = typeof next === "function" ? next(mock.states[index]) : next; }];
    },
    useRef: (initial: unknown) => { const index = mock.cursor++; if (!(index in mock.states)) mock.states[index] = { current: initial }; return mock.states[index]; },
    useTransition: () => [false, (action: () => Promise<void>) => { mock.transition = Promise.resolve(action()); }],
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh, push: mock.push }) }));
vi.mock("@/app/admin/categories/actions", () => ({ createCategory: mock.createCategory }));
vi.mock("@/app/admin/products/actions", () => ({ createProduct: mock.createProduct, updateProduct: mock.updateProduct, archiveProduct: vi.fn(), unarchiveProduct: vi.fn(), unpublishProduct: mock.unpublishProduct }));
vi.mock("../products/image-input", () => ({ ImageInput: () => null }));
vi.mock("../products/variant-editor", () => ({ VariantEditor: () => null }));

import { AvailableCountEditor } from "../inventory/available-count-editor";
import { CategorySelect } from "../products/category-select";
import { ProductForm } from "../products/product-form";
import { AdditionalCollections } from "../products/additional-collections";

type Element = { type: unknown; props: Record<string, unknown> };
function find(node: unknown, predicate: (element: Element) => boolean): Element {
  const queue: unknown[] = [node];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) { queue.push(...current); continue; }
    if (!current || typeof current !== "object" || !("props" in current)) continue;
    const element = current as Element;
    if (predicate(element)) return element;
    queue.push(element.props.children);
  }
  throw new Error("Expected control not found");
}
function render<T>(component: () => T): T { mock.cursor = 0; return component(); }
function click(element: Element) { (element.props.onClick as () => void)(); }
function change(element: Element, value: string) { (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); }
beforeEach(() => { mock.states = []; mock.cursor = 0; mock.transition = Promise.resolve(); vi.clearAllMocks(); });

describe("explicit available-count editing", () => {
  it("saves against the version seen when editing began, even after a sale refresh", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: false, error: "Stock changed" });
    let quantity = 10, version = 3;
    const component = () => AvailableCountEditor({ quantity, version, label: "White M", lowStockThreshold: 2, onSave });
    click(find(render(component), el => el.type === "button"));
    quantity = 9; version = 4;
    change(find(render(component), el => el.type === "input"), "8");
    change(find(render(component), el => el.type === "input" && el.props.placeholder === "e.g. Count correction or damaged stock"), "Count correction");
    const form = find(render(component), el => el.type === "form");
    (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault() {} });
    await mock.transition;
    expect(onSave).toHaveBeenCalledWith(8, 3, expect.objectContaining({ reason: "Count correction", operationKey: expect.any(String) }));
    expect(mock.refresh).toHaveBeenCalledOnce();
  });
  it("does not mutate stock when editing is cancelled", () => {
    const onSave = vi.fn();
    const component = () => AvailableCountEditor({ quantity: 10, version: 3, label: "White M", lowStockThreshold: 2, onSave });
    click(find(render(component), el => el.type === "button"));
    change(find(render(component), el => el.type === "input"), "99");
    click(find(render(component), el => el.type === "button" && el.props.children === "Cancel"));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("context-aware collection creation", () => {
  const departments = [{ slug: "men", name: "Men" }, { slug: "women", name: "Women" }];
  it("uses the selected collection's department and accepts an optional image", async () => {
    mock.createCategory.mockResolvedValue({ success: true, slug: "new-car", name: "New car" });
    const onChange = vi.fn();
    const component = () => CategorySelect({ categories: [{ slug: "car", name: "Car", departmentSlug: "men" }], departments, value: "car", onChange });
    change(find(render(component), el => el.type === "select"), "__new__");
    change(find(render(component), el => el.type === "input"), "New car");
    const button = find(render(component), el => el.type === "button" && el.props.children === "Create collection");
    expect(button.props.disabled).toBe(false);
    click(button); await mock.transition;
    expect(mock.createCategory).toHaveBeenCalledWith({ name: "New car", image: null, departmentSlug: "men" });
    expect(onChange).toHaveBeenCalledWith("new-car");
  });
  it("does not silently choose Women when there is no collection context", () => {
    const component = () => CategorySelect({ categories: [], departments, value: "", onChange: vi.fn() });
    change(find(render(component), el => el.type === "select"), "__new__");
    change(find(render(component), el => el.type === "input"), "Bags");
    const button = find(render(component), el => el.type === "button" && el.props.children === "Create collection");
    expect(button.props.disabled).toBe(true);
    expect(mock.createCategory).not.toHaveBeenCalled();
  });
});

describe("editing an existing product", () => {
  it("saves an unfinished draft without a physical family or blank placeholder variant", async () => {
    mock.createProduct.mockResolvedValue({ success: true });
    const component = () => ProductForm({ mode: "create", categories: [], departments: [], designs: [], initial: {
      name: "Draft tote", designSlug: "bags", price: "2000", originalPrice: "", description: "", archived: false, dtfDesignId: "", inventoryProductId: null, variants: [],
    } });
    click(find(render(component), element => element.type === "button" && element.props.children === "Save draft"));
    await mock.transition;
    expect(mock.createProduct).toHaveBeenCalledWith(expect.objectContaining({ status: "DRAFT", inventoryProductId: null, dtfDesignId: null, description: "", variants: [] }));
  });
  it("blocks publishing a draft without its physical family", () => {
    const component = () => ProductForm({ mode: "edit", categories: [], departments: [], designs: [], initial: {
      id: "draft", status: "DRAFT", name: "Draft", designSlug: "bags", price: "2000", originalPrice: "", description: "", archived: false, dtfDesignId: "", variants: [],
    } });
    click(find(render(component), element => element.type === "button" && element.props.children === "Publish"));
    expect(find(render(component), element => element.props.role === "alert").props.children).toContain("physical product family");
    expect(mock.updateProduct).not.toHaveBeenCalled();
  });
  it("unpublishes an existing product and exposes draft controls", async () => {
    mock.unpublishProduct.mockResolvedValue({ success: true });
    const component = () => ProductForm({ mode: "edit", categories: [], departments: [], designs: [], initial: {
      id: "published", status: "PUBLISHED", name: "Published", designSlug: "bags", price: "2000", originalPrice: "", description: "Description", archived: false, dtfDesignId: "print", variants: [],
    } });
    click(find(render(component), element => element.type === "button" && element.props.children === "Unpublish"));
    await mock.transition;
    expect(mock.unpublishProduct).toHaveBeenCalledWith("published");
    expect(find(render(component), element => element.type === "button" && element.props.children === "Save draft")).toBeDefined();
    expect(() => find(render(component), element => element.type === "a" && element.props.children === "View on storefront ↗")).toThrow();
  });
  it("promotes an additional collection to primary without submitting a duplicate membership", async () => {
    mock.updateProduct.mockResolvedValue({ success: true });
    const component = () => ProductForm({ mode: "edit", categories: [{ slug: "car", name: "Car", departmentSlug: "men" }, { slug: "gifts", name: "Gifts", departmentSlug: "men" }], departments: [{ slug: "men", name: "Men" }], designs: [], inventoryParents: [{ id: "parent", name: "Oversized" }], initial: {
      id: "original", name: "Original", designSlug: "car", additionalCollectionSlugs: ["gifts"], price: "2000", originalPrice: "", description: "Description", archived: false, dtfDesignId: "print", inventoryProductId: "parent", variants: [],
    } });
    const selector = find(render(component), element => element.type === CategorySelect);
    (selector.props.onChange as (slug: string) => void)("gifts");
    click(find(render(component), element => element.type === "button" && element.props.children === "Save changes"));
    await mock.transition;
    expect(mock.updateProduct).toHaveBeenCalledWith("original", expect.objectContaining({ designSlug: "gifts", additionalCollectionSlugs: [] }));
  });
  it("keeps its URL and explicit shared blank when only the name changes", async () => {
    mock.updateProduct.mockResolvedValue({ success: true });
    const component = () => ProductForm({ mode: "edit", categories: [{ slug: "car", name: "Car", departmentSlug: "men" }], departments: [{ slug: "men", name: "Men" }], designs: [{ id: "print", name: "Print" }], inventoryParents: [{ id: "parent", name: "Oversized" }], stockOptions: [],
      initial: { id: "original-url", name: "Original", designSlug: "car", price: "2000", originalPrice: "", description: "Description", archived: false, dtfDesignId: "print", inventoryProductId: "parent", variants: [{ id: "variant", color: "White", colorSlug: "white", swatchHex: "", sku: "", price: "", originalPrice: "", cardImages: ["/a.jpg"], detailImages: ["/a.jpg"], sizeStocks: [{ size: "M", plainTshirtStockId: "shared-blank" }] }] } });
    change(find(render(component), el => el.props.id === "product-name"), "Renamed product");
    click(find(render(component), el => el.type === "button" && el.props.children === "Save changes"));
    await mock.transition;
    expect(mock.updateProduct).toHaveBeenCalledWith("original-url", expect.objectContaining({ status: "PUBLISHED", name: "Renamed product", slug: "original-url", variants: [expect.objectContaining({ id: "variant", sizeStocks: [{ size: "M", plainTshirtStockId: "shared-blank" }] })] }));
  });
});

describe("additional collection selector", () => {
  const categories = [{ slug: "primary", name: "Primary", departmentSlug: "men" }, { slug: "gifts", name: "Gifts", departmentSlug: "men" }, { slug: "totes", name: "Totes", departmentSlug: "women" }];
  const departments = [{ slug: "men", name: "Men" }, { slug: "women", name: "Women" }];
  it("excludes the primary and supports adding and removing the same membership", () => {
    let value: string[] = [];
    const component = () => AdditionalCollections({ categories, departments, primary: "primary", value, onChange: next => { value = next; } });
    expect(() => find(render(component), element => element.type === "label" && Array.isArray(element.props.children) && element.props.children.includes("Primary"))).toThrow();
    const checkbox = find(render(component), element => element.type === "input" && element.props.type === "checkbox");
    (checkbox.props.onChange as () => void)();
    expect(value).toEqual(["gifts"]);
    click(find(render(component), element => element.type === "button" && element.props["aria-label"] === "Remove Men → Gifts"));
    expect(value).toEqual([]);
  });
  it("filters by department name and retains selected collections while searching", () => {
    const component = () => AdditionalCollections({ categories, departments, primary: "primary", value: ["gifts"], onChange: vi.fn() });
    change(find(render(component), element => element.type === "input" && element.props.type === "search"), "Women");
    expect(find(render(component), element => element.type === "legend" && element.props.children === "Women")).toBeDefined();
    expect(() => find(render(component), element => element.type === "legend" && element.props.children === "Men")).toThrow();
    expect(find(render(component), element => element.type === "button" && element.props["aria-label"] === "Remove Men → Gifts")).toBeDefined();
  });
});
