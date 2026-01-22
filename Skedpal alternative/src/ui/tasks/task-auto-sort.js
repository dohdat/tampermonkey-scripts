import { getAllTasks, saveTask } from "../../data/db.js";
import { state } from "../state/page-state.js";
import { computeSubsectionPrioritySortUpdates } from "./tasks.js";

export async function maybeAutoSortSubsectionOnAdd(
  sectionId,
  subsectionId,
  deps = {}
) {
  if (!state.settingsCache?.autoSortNewTasks) {return false;}
  const getTasks = deps.getAllTasks || getAllTasks;
  const save = deps.saveTask || saveTask;
  const compute = deps.computeSubsectionPrioritySortUpdates ||
    computeSubsectionPrioritySortUpdates;
  const tasks = await getTasks();
  const { updates, changed } = compute(
    tasks,
    sectionId,
    subsectionId
  );
  if (!changed) {return false;}
  await Promise.all(updates.map((task) => save(task)));
  return true;
}
