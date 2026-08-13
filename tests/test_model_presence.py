"""Model presence must be checked the way each model is loaded."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import download_models as dm
from config import ACCENT_MODEL_REPO, EMOTION_MODEL_REPO

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


print("\n== every repo is verified the way it is fetched ==")
# A user's log showed 49 setup runs: download_model() fetched a subset while the
# check demanded a full snapshot, so it reported MISSING forever and the
# first-run screen reappeared on every launch. Verified against a clean cache:
# the old check said MISSING, the new one says OK.
src = pathlib.Path(dm.__file__).read_text()
check("faster-whisper has its own checker", "_faster_whisper_present" in src)
check("it checks the file set faster_whisper fetches", "vocabulary.txt" in src and "model.bin" in src)
check("it does not call the loader (that cost 3.5s per launch)",
      "download_model(WHISPER_MODEL, local_files_only=True)" not in src)
check("the classifiers have theirs", "_loadable" in src)
check("only whole-repo downloads use snapshot_download",
      "_present(repo)" in src and "_LOADABLE_REPOS" in src)

print("\n== the routing covers every repo in the list ==")
routed = []
for label, repo in dm.REPOS:
    if repo in dm._LOADABLE_REPOS:
        routed.append((label, "loadable"))
    elif repo == dm.WHISPER_REPO_ID:
        routed.append((label, "faster-whisper"))
    else:
        routed.append((label, "snapshot"))
for label, how in routed:
    print(f"    {label:34s} -> {how}")
check("the classifiers are not snapshot-checked",
      all(how != "snapshot" for l, how in routed if "classifier" in l.lower()))
check("the CPU whisper is not snapshot-checked",
      all(how == "faster-whisper" for l, how in routed if "CPU fallback" in l))
check("everything is routed somewhere", len(routed) == len(dm.REPOS))

print("\n== and the whole check stays fast enough to run at every launch ==")
import time
t0 = time.perf_counter()
dm.check()
dt = time.perf_counter() - t0
print(f"    took {dt:.2f}s")
check("under two seconds", dt < 2.0, f"{dt:.2f}s")

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
