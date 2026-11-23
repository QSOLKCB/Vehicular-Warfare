// Read-only commander display. Last-known symbols always use the copied report.
export function chartContacts(w, visible) {
  const current = new Set(visible.map(actor => actor.id));
  return w.tactical.intel.cobalt.contacts.map(c => ({
    id:c.id, kind:c.kind, source:c.source, tick:c.observedTick, position:c.p.slice(),
    current:c.visible && current.has(c.id)
  }));
}

export function decisionReport(world, selected) {
  if (!selected.size) return 'Select a crew on the chart or roster.';
  return [...selected].map(id => {
    const crew = world.tactical.crews[id], decision = crew.decision;
    const task = crew.task;
    const lines = [id + ' · ' + crew.doctrine];
    if (task) lines.push((task.active?'':'Last task · ') + task.task + ' · ' + task.reason);
    if (!decision) lines.push('Awaiting first decision.');
    else {
      lines.push('Tick ' + decision.tick + ' · ' + decision.doctrine + ' · ' + decision.action, decision.reason);
      if (decision.goal) lines.push('Objective ' + decision.goal.map(Math.round).join(', '));
      if (decision.contact) lines.push(decision.contact + ' · score ' + decision.score,
        'Observed by ' + decision.source + ' at tick ' + decision.observedTick);
      if (decision.contact && decision.candidates?.length) {
        const top = decision.candidates.slice(0,3).map(([id,score]) => id + ' ' + score);
        lines.push('Highest reported scores · ' + top.join(', '));
      }
    }
    const human = world.units[id];
    const result = human.queue.length || task ? human.lastResult : crew.controller.lastResult;
    if (result) lines.push(result.status + ' · ' + result.reason);
    return lines.join('\n');
  }).join('\n\n');
}

export function contactReport(contacts, tick) {
  if (!contacts.length) return 'No reported contacts.';
  return contacts.map(c => c.id + ' · ' + (c.current ? 'in sight' : 'last known') +
    '\n' + (tick-c.tick) + ' ticks since report · ' + c.source +
    '\nX ' + Math.round(c.position[0]) + ' / Z ' + Math.round(c.position[2])).join('\n\n');
}
