import { useEffect, useRef, useState } from "react";
import { auth, SessionInfo } from "./api";

type Props = {
  uri: string;
  /** Why the user sees this screen again, such as an expired session. */
  notice?: string | null;
  /** Pre-filled user name, when logging in again. */
  user?: string;
  onLogin: (session: SessionInfo) => void;
};

export default function Login({ uri, notice, user, onLogin }: Props) {
  const [mode, setMode] = useState<"password" | "token">("password");
  const [username, setUsername] = useState(user ?? "");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const pass = useRef<HTMLInputElement>(null);

  useEffect(() => (mode === "password" && user ? pass.current : first.current)?.focus(), [mode, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await auth.login(mode === "token" ? { token } : { username, password });
      setPassword("");
      setToken("");
      onLogin(session);
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const ready = mode === "token" ? token.trim() !== "" : username.trim() !== "" && password !== "";

  return (
    <div className="login-page">
      <form className="login" onSubmit={submit}>
        <h1>GraphBuff Admin</h1>
        <p className="muted server">{uri}</p>
        {notice && <p className="notice">{notice}</p>}
        <div className="seg login-mode" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "password"} className={mode === "password" ? "on" : ""} onClick={() => setMode("password")}>
            Password
          </button>
          <button type="button" role="tab" aria-selected={mode === "token"} className={mode === "token" ? "on" : ""} onClick={() => setMode("token")}>
            API token
          </button>
        </div>
        {mode === "password" ? (
          <>
            <label className="field">
              <span>User name</span>
              <input ref={first} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </label>
            <label className="field">
              <span>Password</span>
              <input ref={pass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          </>
        ) : (
          <label className="field">
            <span>Token</span>
            <input ref={first} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="gbt_…" autoComplete="off" />
            <small className="muted">Tokens are never administrators: users and tokens cannot be managed with one.</small>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={!ready || busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
