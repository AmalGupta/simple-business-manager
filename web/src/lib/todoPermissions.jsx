import { createContext, useContext } from "react";

/* SBM-82 — who may tick a todo done / undo it.
   - While a router is set (/api/me todo_routing_active), staff can't mark a
     todo done until it's been routed (todos.routed_at). Admins can complete
     it either way (SBM-100).
   - Only an admin can reopen a done todo.
   The server enforces both; this only keeps the UI from offering them. */

const TodoPermissionsContext = createContext({ routingActive: false, canReopen: true, isAdmin: false });

export function TodoPermissionsProvider({ me, children }) {
  const value = {
    routingActive: Boolean(me?.todo_routing_active),
    canReopen: me?.role !== "staff",
    isAdmin: Boolean(me) && me.role !== "staff",
  };
  return <TodoPermissionsContext.Provider value={value}>{children}</TodoPermissionsContext.Provider>;
}

/** Read receipts are for whoever assigns: admins, once the todo is routed. */
export function useShowTodoReceipt(todo) {
  const { routingActive, isAdmin } = useContext(TodoPermissionsContext);
  return isAdmin && (todo?.assignees?.length ?? 0) > 0 && (!routingActive || Boolean(todo?.routed_at));
}

export function useTodoPermissions(todo) {
  const { routingActive, canReopen, isAdmin } = useContext(TodoPermissionsContext);
  return {
    canComplete: isAdmin || !routingActive || Boolean(todo?.routed_at),
    canReopen,
  };
}
