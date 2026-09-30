import { createContext, useContext } from "react";

/* SBM-82 — who may tick a todo done / undo it.
   - While a router is set (/api/me todo_routing_active), a todo can't be
     marked done until it's been routed (todos.routed_at) — the done control
     is hidden on freshly extracted todos so routing a call can't close them.
   - Only an admin can reopen a done todo.
   The server enforces both; this only keeps the UI from offering them. */

const TodoPermissionsContext = createContext({ routingActive: false, canReopen: true });

export function TodoPermissionsProvider({ me, children }) {
  const value = {
    routingActive: Boolean(me?.todo_routing_active),
    canReopen: me?.role !== "staff",
  };
  return <TodoPermissionsContext.Provider value={value}>{children}</TodoPermissionsContext.Provider>;
}

export function useTodoPermissions(todo) {
  const { routingActive, canReopen } = useContext(TodoPermissionsContext);
  return {
    canComplete: !routingActive || Boolean(todo?.routed_at),
    canReopen,
  };
}
