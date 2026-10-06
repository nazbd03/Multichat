using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace MultistreamChatApp
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            string electronPath = Path.Combine(appDir, "node_modules", "electron", "dist", "electron.exe");

            if (!File.Exists(electronPath))
            {
                MessageBox.Show(
                    "No se encontró el ejecutable de Electron en:\n" + electronPath,
                    "Multistream Chat Overlay",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // Filter flags like --hidden or --background
            List<string> validFlags = new List<string>();
            if (args != null)
            {
                foreach (string arg in args)
                {
                    if (arg.StartsWith("-"))
                    {
                        validFlags.Add(arg);
                    }
                }
            }
            string extraArgs = validFlags.Count > 0 ? " " + string.Join(" ", validFlags.ToArray()) : "";

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = electronPath,
                Arguments = "\"" + appDir + "\"" + extraArgs,
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            // Remove and clear ELECTRON_RUN_AS_NODE so Electron runs in full GUI desktop mode
            if (psi.EnvironmentVariables.ContainsKey("ELECTRON_RUN_AS_NODE"))
            {
                psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "";
                psi.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            }

            // Ensure Node.js directory is in PATH
            string nodeDir = @"C:\Program Files\nodejs";
            if (Directory.Exists(nodeDir) && !psi.EnvironmentVariables["PATH"].Contains(nodeDir))
            {
                psi.EnvironmentVariables["PATH"] = nodeDir + ";" + psi.EnvironmentVariables["PATH"];
            }

            try
            {
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error al iniciar la aplicación: " + ex.Message,
                    "Multistream Chat Overlay",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
