param([int]$port = 8080)

# Verificar se a porta padrão está livre; caso contrário, usar 8088
try {
    $test = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
    $test.Start()
    $test.Stop()
} catch {
    $port = 8088
}

# Garantir que o diretório correto do projeto seja sempre detectado
$scriptDir = $PSScriptRoot
if (-not $scriptDir -or -not (Test-Path "$scriptDir\index.html")) {
    $scriptDir = (Get-Location).Path
}
if (-not (Test-Path "$scriptDir\index.html")) {
    $scriptDir = "C:\Users\arthu\Desktop\Arthur\Itens\Inventario casa"
}

# Obter o IP da rede Wi-Fi real (desconsiderando Hamachi 25.* e adaptadores virtuais)
$localIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "169.254*" } | Select-Object -First 1).IPAddress
if (-not $localIp) {
    $localIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { 
        $_.IPAddress -notlike "127.*" -and 
        $_.IPAddress -notlike "169.254*" -and 
        $_.IPAddress -notlike "25.*" 
    } | Select-Object -First 1).IPAddress
}
if (-not $localIp) { $localIp = "192.168.100.40" }

# Compilar servidor multithread nativo em C# (Zero dependências, altíssima velocidade e suporte a conexões simultâneas)
$csharpCode = @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Collections.Generic;

public class NativeWebServer {
    private TcpListener _listener;
    private string _root;
    private bool _running;

    private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
        { ".html", "text/html; charset=utf-8" },
        { ".htm", "text/html; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".js", "application/javascript; charset=utf-8" },
        { ".mjs", "application/javascript; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".svg", "image/svg+xml" },
        { ".png", "image/png" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".webp", "image/webp" },
        { ".ico", "image/x-icon" }
    };

    public void Start(int port, string root) {
        _root = root;
        _listener = new TcpListener(IPAddress.Any, port);
        _listener.Start();
        _running = true;

        new Thread(() => {
            while (_running) {
                try {
                    TcpClient client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                } catch {
                    break;
                }
            }
        }) { IsBackground = true }.Start();
    }

    public void Stop() {
        _running = false;
        try { _listener.Stop(); } catch {}
    }

    private void HandleClient(object state) {
        using (TcpClient client = (TcpClient)state) {
            try {
                using (NetworkStream stream = client.GetStream()) {
                    stream.ReadTimeout = 3000;
                    byte[] buffer = new byte[8192];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead <= 0) return;

                    string req = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    string[] lines = req.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;

                    string[] parts = lines[0].Split(' ');
                    if (parts.Length < 2) return;

                    string rawUrl = parts[1].Split('?')[0];
                    if (rawUrl == "/" || string.IsNullOrWhiteSpace(rawUrl)) {
                        rawUrl = "/index.html";
                    }

                    string clean = Uri.UnescapeDataString(rawUrl.TrimStart('/'));
                    string safePath = Path.Combine(_root, clean.Replace('/', Path.DirectorySeparatorChar));

                    if (File.Exists(safePath)) {
                        string ext = Path.GetExtension(safePath);
                        string mime = MimeTypes.ContainsKey(ext) ? MimeTypes[ext] : "application/octet-stream";
                        byte[] fileBytes = File.ReadAllBytes(safePath);

                        string header = "HTTP/1.1 200 OK\r\n" +
                                        "Content-Type: " + mime + "\r\n" +
                                        "Content-Length: " + fileBytes.Length + "\r\n" +
                                        "Access-Control-Allow-Origin: *\r\n" +
                                        "Cache-Control: no-cache\r\n" +
                                        "Connection: close\r\n\r\n";

                        byte[] headerBytes = Encoding.ASCII.GetBytes(header);
                        stream.Write(headerBytes, 0, headerBytes.Length);
                        stream.Write(fileBytes, 0, fileBytes.Length);
                    } else {
                        byte[] notFound = Encoding.UTF8.GetBytes("404 Not Found");
                        string header = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: " + notFound.Length + "\r\nConnection: close\r\n\r\n";
                        byte[] headerBytes = Encoding.ASCII.GetBytes(header);
                        stream.Write(headerBytes, 0, headerBytes.Length);
                        stream.Write(notFound, 0, notFound.Length);
                    }
                }
            } catch {}
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $csharpCode -Language CSharp -ErrorAction Stop
} catch {
    # Já compilado na sessão atual
}

$server = New-Object NativeWebServer
$server.Start($port, $scriptDir)

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🍎 Inventario Apple - Casa (Servidor Multiplataforma)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "-> No Computador (PC / Mac):" -ForegroundColor Green
Write-Host "   http://localhost:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "-> No iPhone / iPad (conectado no mesmo Wi-Fi):" -ForegroundColor Green
Write-Host "   http://$($localIp):$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Dica no iPhone / iPad:" -ForegroundColor White
Write-Host "1. Abra o Safari e digite o endereco acima: http://$($localIp):$port" -ForegroundColor Gray
Write-Host "2. Toque no icone Compartilhar (quadrado com seta para cima)" -ForegroundColor Gray
Write-Host "3. Selecione 'Adicionar a Tela de Inicio' para usar como App!" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para encerrar o servidor." -ForegroundColor DarkGray
Write-Host ""

# Abrir no navegador do computador
Start-Process "http://localhost:$port"

# Manter servidor em execucao
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    $server.Stop()
}
