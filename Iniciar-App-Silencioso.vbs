Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

electronPath = currentDir & "\node_modules\electron\dist\electron.exe"
nodeDir = "C:\Program Files\nodejs"

cmdToRun = "cmd /c set ""PATH=" & nodeDir & ";%PATH%"" && """ & electronPath & """ """ & currentDir & """"
WshShell.Run cmdToRun, 0, False
