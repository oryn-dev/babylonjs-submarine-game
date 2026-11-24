type Child = Node | string | null | false;

export function el(tag: string, className = "", children: Child[] | string = [], attributes: Record<string, string> = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of typeof children === "string" ? [children] : children) if (child) node.append(child);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

export function button(className: string, children: Child[] | string, onClick: () => void, label?: string) {
  const node = el("button", className, children, { type: "button", ...(label && { "aria-label": label }) }) as HTMLButtonElement;
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
    node.blur();
  });
  return node;
}

export const money = (value: number) => Math.round(value).toLocaleString("en-US");
