#!/usr/bin/env python3
"""Makes the "YOLK" Shortcut for the Apple Watch (and iPhone).

  python3 yolk/tools/make_watch_shortcut.py

It asks what you want to say, sends it to YOLK on this Mac (/api/watch, with the
watch key from data/station.json), and shows her answer. The finished file goes
in yolk/data/ (it holds the key, so it stays out of git); open it to add it to
Shortcuts, and iCloud carries it to the iPhone and the watch.
It only reaches her on home Wi-Fi, since YOLK lives on this Mac.
"""
import plistlib
import subprocess
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

key = server.station_config()["watch_key"]
host = subprocess.run(["scutil", "--get", "LocalHostName"], capture_output=True, text=True).stdout.strip()
url = f"http://{host}.local:{server.PORT}/api/watch"


def text(s):
    return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}


ask, fetch = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
actions = [
    {"WFWorkflowActionIdentifier": "is.workflow.actions.ask",
     "WFWorkflowActionParameters": {"UUID": ask, "WFInputType": "Text", "WFAskActionPrompt": "talk to yolk"}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
     "WFWorkflowActionParameters": {
         "UUID": fetch, "WFURL": url, "WFHTTPMethod": "POST", "ShowHeaders": True,
         "WFHTTPHeaders": {"Value": {"WFDictionaryFieldValueItems": [
             {"WFItemType": 0, "WFKey": text("X-YOLK-Key"), "WFValue": text(key)}]},
             "WFSerializationType": "WFDictionaryFieldValue"},
         "WFHTTPBodyType": "File",
         "WFRequestVariable": {"Value": {"OutputUUID": ask, "Type": "ActionOutput", "OutputName": "Provided Input"},
                               "WFSerializationType": "WFTextTokenAttachment"}}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.showresult",
     "WFWorkflowActionParameters": {"Text": {"Value": {"string": "￼", "attachmentsByRange": {
         "{0, 1}": {"OutputUUID": fetch, "Type": "ActionOutput", "OutputName": "Contents of URL"}}},
         "WFSerializationType": "WFTextTokenString"}}},
]
shortcut = {
    "WFWorkflowClientVersion": "2605.0.5",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["Watch"],
    "WFWorkflowInputContentItemClasses": [],
    "WFWorkflowImportQuestions": [],
    "WFWorkflowHasShortcutInputVariables": False,
    "WFWorkflowActions": actions,
}
raw = server.DATA / "YOLK unsigned.shortcut"
out = server.DATA / "YOLK.shortcut"
raw.write_bytes(plistlib.dumps(shortcut, fmt=plistlib.FMT_BINARY))
subprocess.run(["shortcuts", "sign", "--mode", "people-who-know-me", "--input", str(raw), "--output", str(out)], check=True)
raw.unlink()
print("made", out)
print("talks to", url)
