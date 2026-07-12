"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSocket } from "@/lib/socket-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "overview" | "users" | "levels" | "sessions" | "analytics";

interface OverviewSummary {
  issued: number;
  waiting: number;
  inProgress: number;
  completed: number;
  hold: number;
  noShow: number;
}

interface OverviewCabin {
  id: number;
  name: string;
  level: string;
  operator: string | null;
  isActive: boolean;
  currentToken: string | null;
  processedToday: number;
}

interface OverviewData {
  summary: OverviewSummary;
  cabins: OverviewCabin[];
  throughput: unknown;
}

interface User {
  id: number;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  cabinName: string | null;
}

interface Level {
  id: number;
  name: string;
  order: number;
  isActive: boolean;
  queueSortStrategy: string;
  cabinCount: number;
}

interface Cabin {
  id: number;
  name: string;
  levelId: number;
  levelName: string;
  operatorId: number | null;
  operatorName: string | null;
  isActive: boolean;
}

interface SessionInfo {
  id: number;
  date: string;
  tokenCount: number;
  status: string;
}

interface PastSession {
  id: number;
  date: string;
  totalTokens: number;
  completed: number;
  hold: number;
  noShow: number;
}

interface SessionsData {
  current: SessionInfo | null;
  past: PastSession[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "levels", label: "Levels & Cabins" },
  { key: "sessions", label: "Sessions" },
  { key: "analytics", label: "Analytics" },
];

const roleBadge = (role: string) => {
  const map: Record<string, string> = {
    ADMIN: "bg-teal-light text-teal border border-teal-border",
    RECEPTION: "bg-amber-bg text-amber border border-amber-border",
    CABIN_OPERATOR: "bg-paper-dark text-dark border border-border",
  };
  return map[role] ?? "bg-paper-dark text-muted border border-border";
};

const roleLabel = (role: string) => {
  const map: Record<string, string> = {
    ADMIN: "Admin",
    RECEPTION: "Reception",
    CABIN_OPERATOR: "Cabin Op",
  };
  return map[role] ?? role;
};

// ---------------------------------------------------------------------------
// Tab Components
// ---------------------------------------------------------------------------

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket("admin");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* retry next interval */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const unsub = on("queue:refresh", () => {
      fetchData();
    });
    return () => {
      unsub();
    };
  }, [on, fetchData]);

  if (loading && !data) {
    return <LoadingPlaceholder />;
  }

  const summary = data?.summary ?? {
    issued: 0,
    waiting: 0,
    inProgress: 0,
    completed: 0,
    hold: 0,
    noShow: 0,
  };
  const cabins = data?.cabins ?? [];

  // Group cabins by level
  const cabinsByLevel: Record<string, OverviewCabin[]> = {};
  for (const cabin of cabins) {
    if (!cabinsByLevel[cabin.level]) cabinsByLevel[cabin.level] = [];
    cabinsByLevel[cabin.level].push(cabin);
  }

  return (
    <div>
      {/* Primary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[
          { label: "ISSUED", value: summary.issued, color: "text-dark" },
          { label: "WAITING", value: summary.waiting, color: "text-amber" },
          { label: "IN PROGRESS", value: summary.inProgress, color: "text-teal" },
          { label: "COMPLETED", value: summary.completed, color: "text-green" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-paper-warm border border-border rounded-xl p-4"
          >
            <div className={`font-mono text-[32px] font-bold leading-none ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-[10px] font-bold tracking-[0.12em] text-muted-light mt-1.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-amber-bg border border-amber-border rounded-xl p-4 flex items-center gap-4">
          <div className="font-mono text-[28px] font-bold text-amber leading-none">
            {summary.hold}
          </div>
          <div className="text-[10px] font-bold tracking-[0.12em] text-amber">
            ON HOLD
          </div>
        </div>
        <div className="bg-red-bg border border-red-border rounded-xl p-4 flex items-center gap-4">
          <div className="font-mono text-[28px] font-bold text-red leading-none">
            {summary.noShow}
          </div>
          <div className="text-[10px] font-bold tracking-[0.12em] text-red">
            NO-SHOW
          </div>
        </div>
      </div>

      {/* Cabin Status Table */}
      {Object.entries(cabinsByLevel).map(([level, levelCabins]) => (
        <div
          key={level}
          className="bg-paper-warm border border-border rounded-xl overflow-hidden mb-4"
        >
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
              CABIN STATUS — {level.toUpperCase()}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-light">
                  <th className="text-left px-4 py-2.5 font-semibold">Cabin</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Operator</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Current Token</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Processed</th>
                </tr>
              </thead>
              <tbody>
                {levelCabins.map((cabin) => {
                  const status = !cabin.isActive
                    ? "Inactive"
                    : cabin.currentToken
                      ? "Busy"
                      : "Idle";
                  const statusClass = !cabin.isActive
                    ? "bg-paper-dark text-muted-light border border-border"
                    : cabin.currentToken
                      ? "bg-teal-light text-teal border border-teal-border"
                      : "bg-amber-bg text-amber border border-amber-border";
                  return (
                    <tr
                      key={cabin.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-4 py-2.5 font-semibold text-dark">
                        {cabin.name}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {cabin.operator ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded ${statusClass}`}
                        >
                          {status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-dark">
                        {cabin.currentToken ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-dark">
                        {cabin.processedToday}
                      </td>
                    </tr>
                  );
                })}
                {levelCabins.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-muted"
                    >
                      No cabins configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {cabins.length === 0 && (
        <div className="bg-paper-warm border border-border rounded-xl p-8 text-center text-muted">
          No cabin data available
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    role: string;
    password: string;
    isActive: boolean;
  }>({ name: "", role: "", password: "", isActive: true });
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState({
    username: "",
    password: "",
    name: "",
    role: "CABIN_OPERATOR",
  });
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } catch {
      /* retry */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function startEdit(user: User) {
    setEditingId(user.id);
    setEditForm({
      name: user.name,
      role: user.role,
      password: "",
      isActive: user.isActive,
    });
    setAddMode(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", role: "", password: "", isActive: true });
  }

  async function saveEdit(id: number) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        role: editForm.role,
        isActive: editForm.isActive,
      };
      if (editForm.password) {
        body.password = editForm.password;
      }
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        cancelEdit();
        fetchUsers();
      }
    } finally {
      setSaving(false);
    }
  }

  async function addUser() {
    if (!addForm.username || !addForm.password || !addForm.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        setAddMode(false);
        setAddForm({ username: "", password: "", name: "", role: "CABIN_OPERATOR" });
        fetchUsers();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    fetchUsers();
  }

  if (loading) return <LoadingPlaceholder />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
          {users.length} USERS
        </div>
        <button
          onClick={() => {
            setAddMode(!addMode);
            cancelEdit();
          }}
          className="bg-teal text-white font-extrabold text-sm px-4 py-2.5 rounded-xl hover:bg-teal/90 transition-colors"
        >
          {addMode ? "Cancel" : "Add User"}
        </button>
      </div>

      <div className="bg-paper-warm border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-light">
                <th className="text-left px-4 py-2.5 font-semibold">Username</th>
                <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Role</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Cabin</th>
                <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Add user inline row */}
              {addMode && (
                <tr className="border-b border-teal-border bg-teal-light/50">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="username"
                      value={addForm.username}
                      onChange={(e) =>
                        setAddForm({ ...addForm, username: e.target.value })
                      }
                      className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={addForm.name}
                      onChange={(e) =>
                        setAddForm({ ...addForm, name: e.target.value })
                      }
                      className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={addForm.role}
                      onChange={(e) =>
                        setAddForm({ ...addForm, role: e.target.value })
                      }
                      className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="RECEPTION">Reception</option>
                      <option value="CABIN_OPERATOR">Cabin Op</option>
                    </select>
                  </td>
                  <td className="px-4 py-2" colSpan={2}>
                    <input
                      type="password"
                      placeholder="Password"
                      value={addForm.password}
                      onChange={(e) =>
                        setAddForm({ ...addForm, password: e.target.value })
                      }
                      className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={addUser}
                      disabled={saving}
                      className="bg-teal text-white font-extrabold text-xs px-3 py-1.5 rounded-lg hover:bg-teal/90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              )}

              {/* User rows */}
              {users.map((user) =>
                editingId === user.id ? (
                  <tr
                    key={user.id}
                    className="border-b border-teal-border bg-teal-light/30"
                  >
                    <td className="px-4 py-2 font-mono text-muted">
                      {user.username}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.role}
                        onChange={(e) =>
                          setEditForm({ ...editForm, role: e.target.value })
                        }
                        className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="RECEPTION">Reception</option>
                        <option value="CABIN_OPERATOR">Cabin Op</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() =>
                          setEditForm({
                            ...editForm,
                            isActive: !editForm.isActive,
                          })
                        }
                        className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded cursor-pointer ${
                          editForm.isActive
                            ? "bg-teal-light text-green border border-teal-border"
                            : "bg-red-bg text-red border border-red-border"
                        }`}
                      >
                        {editForm.isActive ? "ACTIVE" : "INACTIVE"}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="password"
                        placeholder="New password"
                        value={editForm.password}
                        onChange={(e) =>
                          setEditForm({ ...editForm, password: e.target.value })
                        }
                        className="w-full bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => saveEdit(user.id)}
                          disabled={saving}
                          className="bg-teal text-white font-extrabold text-xs px-3 py-1.5 rounded-lg hover:bg-teal/90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="bg-paper-dark text-muted font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-border"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={user.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-dark font-semibold">
                      {user.username}
                    </td>
                    <td className="px-4 py-2.5 text-dark">{user.name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded ${roleBadge(user.role)}`}
                      >
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded ${
                          user.isActive
                            ? "bg-teal-light text-green border border-teal-border"
                            : "bg-red-bg text-red border border-red-border"
                        }`}
                      >
                        {user.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {user.cabinName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => startEdit(user)}
                          className="text-xs font-bold text-teal hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          className={`text-xs font-bold hover:underline ${
                            user.isActive ? "text-red" : "text-green"
                          }`}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}

              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-muted"
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LevelsTab() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addCabinLevel, setAddCabinLevel] = useState<number | null>(null);
  const [newCabinName, setNewCabinName] = useState("");
  const [deletingCabin, setDeletingCabin] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [levelsRes, cabinsRes, usersRes] = await Promise.all([
        fetch("/api/admin/levels"),
        fetch("/api/admin/cabins"),
        fetch("/api/admin/users"),
      ]);
      if (levelsRes.ok) {
        const data = await levelsRes.json();
        setLevels(data.levels ?? []);
      }
      if (cabinsRes.ok) {
        const data = await cabinsRes.json();
        setCabins(data.cabins ?? []);
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users ?? []);
      }
    } catch {
      /* retry */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function updateLevel(
    id: number,
    updates: Partial<{ name: string; queueSortStrategy: string; isActive: boolean }>
  ) {
    setSaving(true);
    try {
      await fetch("/api/admin/levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function updateCabin(
    id: number,
    updates: Partial<{ operatorId: number | null; isActive: boolean }>
  ) {
    setSaving(true);
    try {
      await fetch("/api/admin/cabins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function addCabin(levelId: number) {
    if (!newCabinName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cabins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCabinName.trim(), levelId }),
      });
      if (res.ok) {
        setAddCabinLevel(null);
        setNewCabinName("");
        fetchAll();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteCabin(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cabins?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletingCabin(null);
        fetchAll();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPlaceholder />;

  const operators = users.filter((u) => u.role === "CABIN_OPERATOR");

  return (
    <div className="flex flex-col gap-5">
      {levels.map((level) => {
        const levelCabins = cabins.filter((c) => c.levelId === level.id);
        return (
          <div key={level.id}>
            {/* Level card */}
            <div className="bg-paper-warm border border-border rounded-xl p-5 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[15px] font-extrabold text-dark">
                    {level.name}
                  </div>
                  <div className="text-xs text-muted">
                    Order {level.order} · {level.cabinCount} cabins
                  </div>
                </div>
                <button
                  onClick={() =>
                    updateLevel(level.id, { isActive: !level.isActive })
                  }
                  disabled={saving}
                  className={`text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-full cursor-pointer transition-colors disabled:opacity-50 ${
                    level.isActive
                      ? "bg-teal-light text-green border border-teal-border"
                      : "bg-red-bg text-red border border-red-border"
                  }`}
                >
                  {level.isActive ? "ACTIVE" : "INACTIVE"}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
                  QUEUE STRATEGY
                </div>
                <select
                  value={level.queueSortStrategy}
                  onChange={(e) =>
                    updateLevel(level.id, {
                      queueSortStrategy: e.target.value,
                    })
                  }
                  disabled={saving}
                  className="bg-paper border border-border rounded-lg px-3 py-1.5 text-sm text-dark outline-none focus:border-teal disabled:opacity-50"
                >
                  <option value="TOKEN_ORDER">Token Order</option>
                  <option value="APPROVAL_TIME">Approval Time</option>
                </select>
              </div>
            </div>

            {/* Cabins for this level */}
            <div className="bg-paper-warm border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
                  CABINS — {level.name.toUpperCase()}
                </span>
                <button
                  onClick={() => {
                    setAddCabinLevel(addCabinLevel === level.id ? null : level.id);
                    setNewCabinName("");
                  }}
                  className="text-xs font-bold text-teal hover:text-teal/80 transition-colors"
                >
                  {addCabinLevel === level.id ? "Cancel" : "+ Add Cabin"}
                </button>
              </div>

              {addCabinLevel === level.id && (
                <div className="px-4 py-3 border-b border-teal-border bg-teal-light/30 flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="e.g. Cabin 11"
                    value={newCabinName}
                    onChange={(e) => setNewCabinName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCabin(level.id)}
                    className="flex-1 bg-paper border border-border rounded-lg px-3 py-2 text-sm text-dark outline-none focus:border-teal"
                    autoFocus
                  />
                  <button
                    onClick={() => addCabin(level.id)}
                    disabled={saving || !newCabinName.trim()}
                    className="bg-teal text-white font-extrabold text-sm px-4 py-2 rounded-lg hover:bg-teal/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-light">
                      <th className="text-left px-4 py-2.5 font-semibold">
                        Cabin
                      </th>
                      <th className="text-left px-4 py-2.5 font-semibold">
                        Operator
                      </th>
                      <th className="text-left px-4 py-2.5 font-semibold">
                        Status
                      </th>
                      <th className="text-right px-4 py-2.5 font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {levelCabins.map((cabin) => (
                      <tr
                        key={cabin.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="px-4 py-2.5 font-semibold text-dark">
                          {cabin.name}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={cabin.operatorId ?? ""}
                            onChange={(e) =>
                              updateCabin(cabin.id, {
                                operatorId: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            disabled={saving}
                            className="bg-paper border border-border rounded-lg px-2.5 py-1.5 text-sm text-dark outline-none focus:border-teal disabled:opacity-50"
                          >
                            <option value="">Unassigned</option>
                            {operators.map((op) => (
                              <option key={op.id} value={op.id}>
                                {op.name} ({op.username})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() =>
                              updateCabin(cabin.id, {
                                isActive: !cabin.isActive,
                              })
                            }
                            disabled={saving}
                            className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded cursor-pointer transition-colors disabled:opacity-50 ${
                              cabin.isActive
                                ? "bg-teal-light text-green border border-teal-border"
                                : "bg-red-bg text-red border border-red-border"
                            }`}
                          >
                            {cabin.isActive ? "ACTIVE" : "INACTIVE"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {deletingCabin === cabin.id ? (
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => deleteCabin(cabin.id)}
                                disabled={saving}
                                className="bg-red text-white font-extrabold text-xs px-3 py-1.5 rounded-lg hover:bg-red/90 disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeletingCabin(null)}
                                className="bg-paper-dark text-muted font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-border"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingCabin(cabin.id)}
                              className="text-xs font-bold text-red hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {levelCabins.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-muted"
                        >
                          No cabins for this level
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}

      {levels.length === 0 && (
        <div className="bg-paper-warm border border-border rounded-xl p-8 text-center text-muted">
          No levels configured
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SessionsTab() {
  const [data, setData] = useState<SessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sessions");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* retry */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function endSession() {
    setEnding(true);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      if (res.ok) {
        setConfirmEnd(false);
        fetchSessions();
      }
    } finally {
      setEnding(false);
    }
  }

  if (loading) return <LoadingPlaceholder />;

  const current = data?.current;
  const past = data?.past ?? [];

  return (
    <div>
      {/* Current session */}
      <div className="bg-paper-warm border border-border rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
            CURRENT SESSION
          </div>
          {current && (
            <span className="flex items-center gap-2 text-xs font-bold text-green bg-teal-light border border-teal-border px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green" />
              {current.status}
            </span>
          )}
        </div>

        {current ? (
          <div>
            <div className="flex items-center gap-6 mb-4">
              <div>
                <div className="text-xs text-muted">Date</div>
                <div className="text-base font-semibold text-dark">
                  {new Date(current.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Tokens Issued</div>
                <div className="font-mono text-2xl font-bold text-dark">
                  {current.tokenCount}
                </div>
              </div>
            </div>

            {!confirmEnd ? (
              <button
                onClick={() => setConfirmEnd(true)}
                className="bg-red-bg border border-red-border text-red font-extrabold text-sm px-5 py-2.5 rounded-xl hover:bg-red-bg/80 transition-colors"
              >
                End Session
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-red-bg border border-red-border rounded-xl p-4">
                <div className="text-sm text-red font-semibold flex-1">
                  Are you sure? This will close the current session and
                  deactivate all pending tokens.
                </div>
                <button
                  onClick={endSession}
                  disabled={ending}
                  className="bg-red text-white font-extrabold text-sm px-4 py-2.5 rounded-lg hover:bg-red/90 disabled:opacity-50"
                >
                  {ending ? "Ending..." : "Confirm End"}
                </button>
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="bg-paper text-muted font-bold text-sm px-4 py-2.5 rounded-lg hover:bg-paper-dark"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-muted text-sm">
            No active session. Start one from the reception desk.
          </div>
        )}
      </div>

      {/* Past sessions */}
      <div className="bg-paper-warm border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">
            PAST SESSIONS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-light">
                <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                <th className="text-right px-4 py-2.5 font-semibold">
                  Total Tokens
                </th>
                <th className="text-right px-4 py-2.5 font-semibold">
                  Completed
                </th>
                <th className="text-right px-4 py-2.5 font-semibold">Hold</th>
                <th className="text-right px-4 py-2.5 font-semibold">
                  No-Show
                </th>
              </tr>
            </thead>
            <tbody>
              {past.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="px-4 py-2.5 text-dark font-semibold">
                    {new Date(session.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-dark">
                    {session.totalTokens}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-green">
                    {session.completed}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-amber">
                    {session.hold}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-red">
                    {session.noShow}
                  </td>
                </tr>
              ))}
              {past.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-muted"
                  >
                    No past sessions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface AnalyticsLevel {
  levelName: string;
  tokenCount: number;
  avgWaitSeconds: number | null;
  avgProcessSeconds: number | null;
}

interface AnalyticsCabin {
  cabinName: string;
  levelName: string;
  processedCount: number;
  avgProcessSeconds: number | null;
}

interface AnalyticsData {
  tokenCounts: Record<string, number>;
  perLevel: AnalyticsLevel[];
  perCabin: AnalyticsCabin[];
  hourlyThroughput: { hour: number; completed: number }[];
  holdReasons: { reason: string; count: number }[];
}

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* retry */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingPlaceholder />;
  if (!data) return <div className="text-muted text-sm text-center py-8">No analytics data available</div>;

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "—";
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const maxHourly = Math.max(...data.hourlyThroughput.map((h) => h.completed), 1);

  return (
    <div>
      {/* Per-Level Stats */}
      <div className="bg-paper-warm border border-border rounded-xl overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">PERFORMANCE BY LEVEL</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-light">
                <th className="text-left px-4 py-2.5 font-semibold">Level</th>
                <th className="text-right px-4 py-2.5 font-semibold">Tokens</th>
                <th className="text-right px-4 py-2.5 font-semibold">Avg Wait</th>
                <th className="text-right px-4 py-2.5 font-semibold">Avg Process</th>
              </tr>
            </thead>
            <tbody>
              {data.perLevel.map((level) => (
                <tr key={level.levelName} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-dark">{level.levelName}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-dark">{level.tokenCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber font-semibold">{formatTime(level.avgWaitSeconds)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-teal font-semibold">{formatTime(level.avgProcessSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hourly Throughput */}
      {data.hourlyThroughput.length > 0 && (
        <div className="bg-paper-warm border border-border rounded-xl p-5 mb-5">
          <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light mb-3">HOURLY THROUGHPUT</div>
          <div className="flex items-end gap-1 h-24">
            {data.hourlyThroughput.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] font-mono text-muted">{h.completed}</div>
                <div
                  className="w-full bg-teal rounded-t"
                  style={{ height: `${(h.completed / maxHourly) * 80}px`, minHeight: h.completed > 0 ? "4px" : "0" }}
                />
                <div className="text-[10px] font-mono text-muted-light">{h.hour}h</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Cabin Performance */}
      <div className="bg-paper-warm border border-border rounded-xl overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[11px] font-bold tracking-[0.1em] text-muted-light">CABIN PERFORMANCE</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-light">
                <th className="text-left px-4 py-2.5 font-semibold">Cabin</th>
                <th className="text-left px-4 py-2.5 font-semibold">Level</th>
                <th className="text-right px-4 py-2.5 font-semibold">Processed</th>
                <th className="text-right px-4 py-2.5 font-semibold">Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {data.perCabin.filter((c) => c.processedCount > 0).map((cabin) => (
                <tr key={cabin.cabinName + cabin.levelName} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-dark">{cabin.cabinName}</td>
                  <td className="px-4 py-2.5 text-muted">{cabin.levelName}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-dark">{cabin.processedCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-teal font-semibold">{formatTime(cabin.avgProcessSeconds)}</td>
                </tr>
              ))}
              {data.perCabin.filter((c) => c.processedCount > 0).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No cabin processing data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hold Reasons */}
      {data.holdReasons.length > 0 && (
        <div className="bg-paper-warm border border-border rounded-xl p-5">
          <div className="text-[11px] font-bold tracking-[0.1em] text-muted-light mb-3">TOP HOLD REASONS</div>
          <div className="flex flex-col gap-2">
            {data.holdReasons.map((hr) => (
              <div key={hr.reason} className="flex items-center gap-3">
                <div className="flex-1 text-sm text-dark">{hr.reason}</div>
                <div className="font-mono font-semibold text-amber text-sm">{hr.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-sm text-muted">Loading...</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-paper">
      {/* Top Nav */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-paper">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-dark hover:bg-paper-warm transition-colors -ml-1"
            aria-label="Back to home"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 15l-5-5 5-5"/></svg>
          </Link>
          <div>
            <div className="text-[17px] font-extrabold text-dark">
              Admin Dashboard
            </div>
            <div className="text-xs text-muted">
              Manage users, levels, cabins &amp; sessions
            </div>
          </div>
        </div>
        <span className="flex items-center gap-2 text-xs font-bold text-green bg-teal-light border border-teal-border px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green" />
          Admin
        </span>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border bg-paper px-6 overflow-x-auto">
        <div className="flex gap-1 whitespace-nowrap">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-bold transition-colors relative ${
                activeTab === tab.key
                  ? "text-teal"
                  : "text-muted hover:text-dark"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal rounded-t" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5 max-w-6xl mx-auto">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "levels" && <LevelsTab />}
        {activeTab === "sessions" && <SessionsTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  );
}
