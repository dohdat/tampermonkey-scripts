export function buildSectionOrder(sections, orderedIds) {
  const byId = new Map((sections || []).map((section) => [section.id, section]));
  const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const remaining = (sections || []).filter((section) => !orderedIds.includes(section.id));
  return [...next, ...remaining];
}

export function buildSubsectionListFromOrder(list, orderedNodes) {
  const byId = new Map((list || []).map((sub) => [sub.id, sub]));
  const next = [];
  orderedNodes.forEach(({ id, parentId }) => {
    const base = byId.get(id);
    if (!base) {return;}
    const desiredParent = parentId || "";
    const updated =
      (base.parentId || "") === desiredParent ? base : { ...base, parentId: desiredParent };
    next.push(updated);
  });
  const remaining = (list || []).filter((sub) => !next.some((entry) => entry.id === sub.id));
  return [...next, ...remaining];
}

export function addCollapsedId(list, id) {
  if (!id) {return Array.isArray(list) ? list : [];}
  const base = Array.isArray(list) ? list.filter(Boolean) : [];
  if (base.includes(id)) {return base;}
  return [...base, id];
}
