import { getAllTasks, saveTask } from "../../data/db.js";
import { state } from "../state/page-state.js";
import { computeSubsectionPrioritySortUpdates } from "./tasks.js";

export async function maybeAutoSortSubsectionOnAdd(sectionId, subsectionId) {
  if (!state.settingsCache?.autoSortNewTasks) {return false;}
  const tasks = await getAllTasks();
  const { updates, changed } = computeSubsectionPrioritySortUpdates(
    tasks,
    sectionId,
    subsectionId
  );
  if (!changed) {return false;}
  await Promise.all(updates.map((task) => saveTask(task)));
  return true;
}
