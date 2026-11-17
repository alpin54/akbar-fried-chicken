"""Menjalankan script Lua ASLI terhadap Redis tiruan di memori memakai liblua5.4 (ctypes).
Input (stdin JSON): {"kv": {...}, "steps": [{"script": "...", "keys": [...], "args": [...]}]}
Output (stdout JSON): {"results": [...], "kv": {...}, "zsets": {...}}.  Exit 77 = liblua tidak tersedia.
Catatan: Redis memakai Lua 5.1, harness memakai 5.4; script sengaja memakai fitur yang sama di keduanya."""
import ctypes, json, sys

import ctypes.util, os
# Urutan pencarian: LUA_LIB (path manual) -> nama umum -> lokasi Homebrew (Apple Silicon & Intel) -> find_library.
CANDIDATES = [os.environ.get("LUA_LIB", "")]
for v in ("5.4", "5.5"):
    CANDIDATES += [f"liblua{v}.so.0", f"liblua{v}.so", f"liblua.{v}.dylib", f"liblua{v}.dylib", f"liblua{v}.dll"]
    for base in ("/opt/homebrew/lib", "/opt/homebrew/opt/lua/lib", "/usr/local/lib", "/usr/local/opt/lua/lib"):
        CANDIDATES += [f"{base}/liblua.{v}.dylib", f"{base}/liblua{v}.dylib", f"{base}/liblua.dylib"]
    found = ctypes.util.find_library(f"lua{v}") or ctypes.util.find_library(f"lua.{v}")
    if found: CANDIDATES.append(found)
CANDIDATES += ["liblua.dylib", ctypes.util.find_library("lua") or ""]
lib = None
for name in CANDIDATES:
    if not name: continue
    try:
        lib = ctypes.CDLL(name); break
    except OSError:
        pass
if lib is None:
    sys.exit(77)

VP, I, S = ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p
def sig(fn, res, *args):
    f = getattr(lib, fn); f.restype = res; f.argtypes = list(args); return f
newstate = sig("luaL_newstate", VP)
openlibs = sig("luaL_openlibs", None, VP)
loadstring = sig("luaL_loadstring", I, VP, S)
pcallk = sig("lua_pcallk", I, VP, I, I, I, ctypes.c_longlong, VP)
gettop = sig("lua_gettop", I, VP)
settop = sig("lua_settop", None, VP, I)
tolstring = sig("lua_tolstring", S, VP, I, VP)
pushstring = sig("lua_pushstring", S, VP, S)
pushinteger = sig("lua_pushinteger", None, VP, ctypes.c_longlong)
pushboolean = sig("lua_pushboolean", None, VP, I)
createtable = sig("lua_createtable", None, VP, I, I)
rawseti = sig("lua_rawseti", None, VP, I, ctypes.c_longlong)
setfield = sig("lua_setfield", None, VP, I, S)
setglobal = sig("lua_setglobal", None, VP, S)
pushcclosure = sig("lua_pushcclosure", None, VP, VP, I)
CFUNC = ctypes.CFUNCTYPE(I, VP)

kv, zsets = {}, {}
errors = []

def redis_cmd(args):
    op = args[0].upper()
    if op == "GET": return kv.get(args[1])
    if op == "SET":
        if "NX" in [a.upper() for a in args[3:]] and args[1] in kv: return None
        kv[args[1]] = args[2]; return "OK"
    if op == "EXISTS": return 1 if args[1] in kv else 0
    if op in ("INCR", "INCRBY"):
        by = 1 if op == "INCR" else int(args[2])
        kv[args[1]] = str(int(kv.get(args[1], "0")) + by); return int(kv[args[1]])
    if op == "ZADD": zsets.setdefault(args[1], {})[args[3]] = float(args[2]); return 1
    if op == "DEL": return 1 if kv.pop(args[1], None) is not None else 0
    errors.append("perintah tidak didukung: " + op); return None

@CFUNC
def lua_redis_call(L):
    n = gettop(L)
    args = [tolstring(L, i, None).decode() for i in range(1, n + 1)]
    r = redis_cmd(args)
    if r is None: pushboolean(L, 0)
    elif isinstance(r, int): pushinteger(L, r)
    elif r == "OK":
        createtable(L, 0, 1); pushstring(L, b"OK"); setfield(L, -2, b"ok")
    else: pushstring(L, r.encode())
    return 1

PRELUDE = r'''
cjson = {}
local function esc(s) return (s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n')) end
function cjson.encode(v)
  local t = type(v)
  if t == 'string' then return '"' .. esc(v) .. '"' end
  if t == 'number' then
    if math.type(v) == 'integer' then return tostring(v) end
    return string.format('%.14g', v)
  end
  if t == 'boolean' then return tostring(v) end
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = k end
  table.sort(keys)
  local out = {}
  for _, k in ipairs(keys) do out[#out + 1] = '"' .. esc(k) .. '":' .. cjson.encode(v[k]) end
  return '{' .. table.concat(out, ',') .. '}'
end
'''

def push_list(L, name, items):
    createtable(L, len(items), 0)
    for i, v in enumerate(items, 1):
        pushstring(L, str(v).encode()); rawseti(L, -2, i)
    setglobal(L, name)

def run(script, keys, args):
    L = newstate(); openlibs(L)
    createtable(L, 0, 1); pushcclosure(L, ctypes.cast(lua_redis_call, VP), 0); setfield(L, -2, b"call"); setglobal(L, b"redis")
    push_list(L, b"KEYS", keys); push_list(L, b"ARGV", args)
    if loadstring(L, PRELUDE.encode()) or pcallk(L, 0, 0, 0, 0, None):
        return {"error": "prelude: " + tolstring(L, -1, None).decode()}
    if loadstring(L, script.encode()):
        return {"error": "syntax: " + tolstring(L, -1, None).decode()}
    if pcallk(L, 0, 1, 0, 0, None):
        return {"error": "runtime: " + tolstring(L, -1, None).decode()}
    out = tolstring(L, -1, None)
    return {"value": json.loads(out.decode()) if out else None}

data = json.load(sys.stdin)
kv.update(data.get("kv", {}))
results = [run(s["script"], s["keys"], s["args"]) for s in data["steps"]]
print(json.dumps({"results": results, "kv": kv, "zsets": {k: sorted(v) for k, v in zsets.items()}, "errors": errors}))
