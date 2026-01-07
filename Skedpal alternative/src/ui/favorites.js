export function buildFavoriteKey(item) {
  if (item.type === "subsection") {
    return `subsection:${item.sectionId || ""}:${item.subsectionId || ""}`;
  }
  return `section:${item.sectionId || ""}`;
}

export function getNextFavoriteOrder(settings) {
  const sections = settings?.sections || [];
  const subsections = settings?.subsections || {};
  const allOrders = [
    ...sections.map((s) => (s.favorite ? Number(s.favoriteOrder) : null)),
    ...Object.values(subsections).flatMap((list) =>
      (list || []).map((sub) => (sub.favorite ? Number(sub.favoriteOrder) : null))
    )
  ].filter((value) => Number.isFinite(value));
  const maxOrder = allOrders.length ? Math.max(...allOrders) : 0;
  return maxOrder + 1;
}

export function applyFavoriteOrder(settings, orderedKeys = []) {
  const sections = settings?.sections || [];
  const subsections = settings?.subsections || {};
  const orderMap = new Map();
  orderedKeys.forEach((key, index) => {
    orderMap.set(key, index + 1);
  });
  let nextOrder = getNextFavoriteOrder(settings);

  const updatedSections = sections.map((section) => {
    if (!section.favorite) {return section;}
    const key = buildFavoriteKey({ type: "section", sectionId: section.id });
    const favoriteOrder = orderMap.get(key) || section.favoriteOrder || nextOrder++;
    return { ...section, favoriteOrder };
  });

  const updatedSubsections = {};
  Object.entries(subsections).forEach(([sectionId, list]) => {
    updatedSubsections[sectionId] = (list || []).map((sub) => {
      if (!sub.favorite) {return sub;}
      const key = buildFavoriteKey({
        type: "subsection",
        sectionId,
        subsectionId: sub.id
      });
      const favoriteOrder = orderMap.get(key) || sub.favoriteOrder || nextOrder++;
      return { ...sub, favoriteOrder };
    });
  });

  return { ...settings, sections: updatedSections, subsections: updatedSubsections };
}

export function toggleFavoriteById(list, targetId, nextOrder) {
  return (list || []).map((item) => {
    if (item.id !== targetId) {return item;}
    const favorite = !item.favorite;
    return {
      ...item,
      favorite,
      favoriteOrder: favorite ? item.favoriteOrder || nextOrder : null
    };
  });
}
