#include <winsock2.h>
#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <vector>
#include <thread>
#include <string>
#include <mutex>
#include <shellscalingapi.h>
#include "json.hpp"

// ================= SSL =================
#include <openssl/ssl.h>
#include <openssl/err.h>

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "Shcore.lib")
#pragma comment(lib, "libssl.lib")
#pragma comment(lib, "libcrypto.lib")

using namespace Gdiplus;
using json = nlohmann::json;

// ================= SERVER =================
const std::string RENDER_HOST = "intenship-final-project.onrender.com";
const int RENDER_PORT = 443;

// ================= GLOBALS =================
SOCKET sockGlobal;
SSL* sslGlobal = nullptr;
bool isConnected = false;
std::string agentUserId;
std::string targetViewerId = ""; 

CLSID jpegClsid;
std::mutex sendMutex;
std::mutex inputMutex;

// ================= DPI SAFE =================
typedef BOOL (WINAPI *SetProcessDpiAwarenessContextProc)(HANDLE);
#ifndef DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
#define DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((HANDLE)-4)
#endif

// ================= AGENT ID =================
std::string get_id_from_filename() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string name = path;
    size_t pos = name.find("agent_");
    if (pos != std::string::npos)
        return name.substr(pos + 6, 24);
    return "default_id";
}

// ================= WS SEND =================
void send_ws_text(const std::string& msg) {
    std::lock_guard<std::mutex> lock(sendMutex);
    if (!sslGlobal || !isConnected) return;

    std::vector<unsigned char> frame;
    frame.push_back(0x81);
    size_t len = msg.size();
    if (len <= 125) frame.push_back(0x80 | (unsigned char)len);
    else if (len <= 65535) {
        frame.push_back(0x80 | 126);
        frame.push_back((len >> 8) & 0xFF);
        frame.push_back(len & 0xFF);
    } else {
        frame.push_back(0x80 | 127);
        for (int i = 7; i >= 0; i--) frame.push_back((len >> (i * 8)) & 0xFF);
    }

    unsigned char mask[4] = {0x12, 0x34, 0x56, 0x78};
    frame.insert(frame.end(), mask, mask + 4);
    for (size_t i = 0; i < len; i++)
        frame.push_back(msg[i] ^ mask[i % 4]);

    SSL_write(sslGlobal, frame.data(), (int)frame.size());
}

// ================= SOCKET.IO =================
void emit_event(const std::string& event, const json& payload) {
    send_ws_text("42[\"" + event + "\"," + payload.dump() + "]");
}

// ================= CONTROL =================
void handle_control(const json& e) {
    std::lock_guard<std::mutex> lock(inputMutex);
    if (!e.contains("type")) return;

    std::string type = e["type"];
    std::cout << "🎮 Control Received: " << type << std::endl;

    if (type == "keydown" || type == "keyup") {
        INPUT in = {0};
        in.type = INPUT_KEYBOARD;
        in.ki.wVk = e["keyCode"];
        in.ki.dwFlags = (type == "keyup") ? KEYEVENTF_KEYUP : 0;
        SendInput(1, &in, sizeof(INPUT));
    }

    if (e.contains("x") && e.contains("y")) {
        int x = (int)(e["x"].get<double>() * 65535);
        int y = (int)(e["y"].get<double>() * 65535);

        INPUT in = {0};
        in.type = INPUT_MOUSE;
        in.mi.dx = x;
        in.mi.dy = y;
        in.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
        SendInput(1, &in, sizeof(INPUT));

        if (type == "mousedown" || type == "mouseup") {
            in.mi.dwFlags |= (type == "mousedown") ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
            SendInput(1, &in, sizeof(INPUT));
        }
    }
}

// ================= RECEIVE LOOP =================
void ws_receive_loop() {
    char buf[131072];
    while (isConnected && sslGlobal) {
        int r = SSL_read(sslGlobal, buf, sizeof(buf) - 1);
        if (r <= 0) break;

        buf[r] = '\0';
        std::string msg(buf);
        if (msg.find("2") == 0) send_ws_text("3");

        size_t p = msg.find('[');
        if (p != std::string::npos) {
            try {
                auto j = json::parse(msg.substr(p));
                if (j[0] == "receive-control-input") handle_control(j[1]);
                if (j[0] == "start-sharing") {
                    targetViewerId = j[1]["targetId"].get<std::string>();
                    std::cout << "🚀 Streaming started to: " << targetViewerId << std::endl;
                }
            } catch (...) {}
        }
    }
    isConnected = false;
    std::cout << "🔌 Disconnected from Server" << std::endl;
}

// ================= BASE64 =================
std::string b64(const unsigned char* d, int l) {
    static const char t[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string o; int v = 0, b = -6;
    for (int i = 0; i < l; i++) {
        v = (v << 8) + d[i]; b += 8;
        while (b >= 0) { o.push_back(t[(v >> b) & 63]); b -= 6; }
    }
    if (b > -6) o.push_back(t[((v << 8) >> (b + 8)) & 63]);
    while (o.size() % 4) o.push_back('=');
    return o;
}

// ================= MAIN =================
int main() {
    HMODULE hUser32 = LoadLibraryA("user32.dll");
    if (hUser32) {
        auto dpiFunc = (SetProcessDpiAwarenessContextProc)GetProcAddress(hUser32, "SetProcessDpiAwarenessContext");
        if (dpiFunc) dpiFunc(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }

    agentUserId = get_id_from_filename();
    std::cout << "🆔 Agent ID: " << agentUserId << std::endl;

    GdiplusStartupInput gdi;
    ULONG_PTR token;
    GdiplusStartup(&token, &gdi, NULL);
    
    // JPEG Init
    UINT n, s; GetImageEncodersSize(&n, &s);
    auto pEnc = (ImageCodecInfo*)malloc(s); GetImageEncoders(n, s, pEnc);
    for (UINT i = 0; i < n; i++) if (wcscmp(pEnc[i].MimeType, L"image/jpeg") == 0) jpegClsid = pEnc[i].Clsid;
    free(pEnc);

    WSADATA wsa; WSAStartup(MAKEWORD(2,2), &wsa);
    SSL_library_init();
    SSL_CTX* ctx = SSL_CTX_new(TLS_client_method());

    while (true) {
        sockGlobal = socket(AF_INET, SOCK_STREAM, 0);
        hostent* he = gethostbyname(RENDER_HOST.c_str());
        if (!he) { Sleep(3000); continue; }
        sockaddr_in addr = {AF_INET, htons(RENDER_PORT)};
        addr.sin_addr = *(in_addr*)he->h_addr;

        if (connect(sockGlobal, (sockaddr*)&addr, sizeof(addr)) != 0) {
            std::cout << "❌ Connection Failed. Retrying..." << std::endl;
            Sleep(3000); continue;
        }

        sslGlobal = SSL_new(ctx);
        SSL_set_tlsext_host_name(sslGlobal, RENDER_HOST.c_str()); // 🔥 CRITICAL FOR RENDER
        SSL_set_fd(sslGlobal, sockGlobal);
        
        if (SSL_connect(sslGlobal) <= 0) {
            closesocket(sockGlobal); Sleep(3000); continue;
        }

        std::string req = "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: " + RENDER_HOST + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
        SSL_write(sslGlobal, req.c_str(), (int)req.size());
        
        char dump[2048]; SSL_read(sslGlobal, dump, sizeof(dump));

        send_ws_text("40");
        json reg;
        reg["userId"] = agentUserId;
        reg["isAgent"] = true;
        emit_event("user-online", reg);

        isConnected = true;
        std::thread(ws_receive_loop).detach();
        std::cout << "✅ Registered on Server. Waiting for Viewer..." << std::endl;

        while (isConnected) {
            if (targetViewerId.empty()) {
                send_ws_text("2"); // Ping
                Sleep(3000);
                continue;
            }

            HDC sc = GetDC(NULL);
            HDC dc = CreateCompatibleDC(sc);
            int w = GetSystemMetrics(SM_CXSCREEN);
            int h = GetSystemMetrics(SM_CYSCREEN);
            HBITMAP bm = CreateCompatibleBitmap(sc, w, h);
            SelectObject(dc, bm);
            BitBlt(dc, 0, 0, w, h, sc, 0, 0, SRCCOPY);

            IStream* st;
            CreateStreamOnHGlobal(NULL, TRUE, &st);
            EncoderParameters ep;
            ep.Count = 1;
            ULONG q = 35; // Quality balance for Render bandwidth
            ep.Parameter[0] = {EncoderQuality, EncoderParameterValueTypeLong, 1, &q};

            Bitmap bmp(bm, NULL);
            bmp.Save(st, &jpegClsid, &ep);

            HGLOBAL hg;
            GetHGlobalFromStream(st, &hg);
            auto* data = (unsigned char*)GlobalLock(hg);

            json frame;
            frame["senderId"] = agentUserId;
            frame["targetId"] = targetViewerId;
            frame["image"] = b64(data, (int)GlobalSize(hg));

            emit_event("screen-update", frame);

            GlobalUnlock(hg);
            st->Release();
            DeleteObject(bm);
            DeleteDC(dc);
            ReleaseDC(NULL, sc);

            Sleep(200); // ~5 FPS for stability
        }
        
        targetViewerId = "";
        if(sslGlobal) { SSL_shutdown(sslGlobal); SSL_free(sslGlobal); sslGlobal = nullptr; }
        closesocket(sockGlobal);
        std::cout << "🔄 Reconnecting..." << std::endl;
        Sleep(3000);
    }
}