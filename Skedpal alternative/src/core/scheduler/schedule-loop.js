function updateSequentialStateForPinned(task, placements, parentState, sequentialInfoById, buildSequentialState) {
  if (!placements.length) {return;}
  const info = sequentialInfoById.get(task.id);
  const ancestors = info?.ancestors || [];
  if (!ancestors.length) {return;}
  const result = { success: true, placements };
  ancestors.forEach((ancestor) => {
    const current = parentState.get(ancestor.id) || {
      failed: false,
      lastEnd: null,
      scheduledOne: false
    };
    parentState.set(ancestor.id, buildSequentialState(current, ancestor.mode, result));
  });
}

function seedSequentialStateForPinnedTasks(
  parentState,
  pinnedState,
  sequentialInfoById,
  buildSequentialState
) {
  if (!pinnedState?.pinnedTaskIdSet?.size) {return;}
  pinnedState.pinnedTaskIdSet.forEach((taskId) => {
    const placements = pinnedState.pinnedByTaskId?.get(taskId) || [];
    updateSequentialStateForPinned(
      { id: taskId },
      placements,
      parentState,
      sequentialInfoById,
      buildSequentialState
    );
  });
}

export function runSchedulingLoop({
  sortedCandidates,
  slots,
  now,
  busy,
  sequentialInfoById,
  pinnedState,
  initialUnscheduled,
  handleSequentialTask,
  placeTaskInSlots,
  getAvailableSlotsForTask,
  applyPlacementsToSlots,
  buildSequentialState
}) {
  const scheduled = [...pinnedState.scheduled];
  const unscheduled = new Set(initialUnscheduled);
  const deferred = new Set();
  const parentState = new Map();
  let workingSlots = slots;

  seedSequentialStateForPinnedTasks(
    parentState,
    pinnedState,
    sequentialInfoById,
    buildSequentialState
  );

  sortedCandidates.forEach((task) => {
    if (pinnedState.pinnedOccurrenceSet.has(task.occurrenceId)) {
      const pinnedPlacementsForTask =
        pinnedState.pinnedByOccurrence.get(task.occurrenceId) || [];
      updateSequentialStateForPinned(
        task,
        pinnedPlacementsForTask,
        parentState,
        sequentialInfoById,
        buildSequentialState
      );
      return;
    }
    const sequentialResult = handleSequentialTask(task, {
      parentState,
      slots: workingSlots,
      now,
      busy,
      sequentialInfoById
    });
    if (sequentialResult?.handled) {
      if (sequentialResult.success) {
        scheduled.push(...sequentialResult.placements);
        workingSlots = sequentialResult.nextSlots;
      } else {
        if (sequentialResult.blocked) {
          deferred.add(task.id);
        } else {
          unscheduled.add(task.id);
        }
      }
      sequentialResult.nextStates?.forEach(({ ancestorId, state }) => {
        parentState.set(ancestorId, state);
      });
      return;
    }
    const availableSlots = getAvailableSlotsForTask(workingSlots, busy, task);
    const { success, placements } = placeTaskInSlots(task, availableSlots, now);
    if (success) {
      scheduled.push(...placements);
      workingSlots = applyPlacementsToSlots(workingSlots, placements);
    } else {
      unscheduled.add(task.id);
    }
  });

  return {
    scheduled,
    unscheduled,
    deferred,
    slots: workingSlots
  };
}
