using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace AkariAI
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                // 1. Locate Akari installation directory
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                if (!File.Exists(Path.Combine(appDir, "package.json")))
                {
                    string defaultPath = @"C:\Users\Asus\.gemini\antigravity-ide\scratch\Akari-AI";
                    if (Directory.Exists(defaultPath) && File.Exists(Path.Combine(defaultPath, "package.json")))
                    {
                        appDir = defaultPath;
                    }
                }

                Directory.SetCurrentDirectory(appDir);

                // 2. Check if server is running on port 3000
                bool isRunning = IsServerRunning("http://127.0.0.1:3000");

                if (!isRunning)
                {
                    // Start backend silently in background
                    ProcessStartInfo serverInfo = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c npm run dev",
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        UseShellExecute = true,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };

                    Process.Start(serverInfo);

                    // Wait up to 5 seconds for port 3000 to be ready
                    for (int i = 0; i < 25; i++)
                    {
                        Thread.Sleep(200);
                        if (IsServerRunning("http://127.0.0.1:3000"))
                            break;
                    }
                }

                // 3. Launch Dedicated Native Desktop Window (Electron if present, or Instant Standalone App Window)
                string localElectronExe = Path.Combine(appDir, @"node_modules\electron\dist\electron.exe");

                if (File.Exists(localElectronExe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = localElectronExe,
                        Arguments = ".",
                        WorkingDirectory = appDir,
                        UseShellExecute = true
                    });
                }
                else
                {
                    string edgePath64 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                    string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                    string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                    string chromePathUser = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe");

                    string browserExe = null;
                    if (File.Exists(edgePath64)) browserExe = edgePath64;
                    else if (File.Exists(edgePath)) browserExe = edgePath;
                    else if (File.Exists(chromePath)) browserExe = chromePath;
                    else if (File.Exists(chromePathUser)) browserExe = chromePathUser;

                    if (browserExe != null)
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = browserExe,
                            Arguments = "--app=http://localhost:3000/ --window-size=1366,860 --app-id=AkariAI",
                            UseShellExecute = true
                        });
                    }
                    else
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = "http://localhost:3000",
                            UseShellExecute = true
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not launch Akari AI: " + ex.Message, "Akari AI", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static bool IsServerRunning(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 800;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
