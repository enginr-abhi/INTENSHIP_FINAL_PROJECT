#include <winsock2.h>
#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <vector>
#include <thread>
#include <string>
#include <mutex> 
#include <algorithm>
#include <shellscalingapi.h>
#include "json.hpp" 

// --- OPENSSL HEADERS ---
#include <openssl/ssl.h>
#include <openssl/err.h>

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "Shcore.lib")

using namespace Gdiplus;
using json = nlohmann::json;

const std::string RENDER_HOST = "intenship-final-project.onrender.com";
const int RENDER_PORT = 443; 

SOCKET sockGlobal;
SSL* sslGlobal = nullptr; 
bool isConnected = false;
std::string targetViewerId = ""; 
std::string agentUserId = "";    
CLSID jpegClsid;
std::mutex sendMutex; 
std::mutex inputMutex; 

// --- DPI Awareness Dynamic Fix Definitions ---
typedef BOOL (WINAPI *SetProcessDpiAwarenessContextProc)(HANDLE);
#ifndef DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
#define DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((HANDLE)-4)
#endif

// --- Helpers ---
std::string get_id_from_filename() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string filename = path;
    size_t lastSlash = filename.find_last_of("\\/");
    if (lastSlash != std::string::npos) filename = filename.substr(lastSlash + 1);
    size_t start = filename.find("agent_");
    if (start != std::string::npos) {
        std::string rawId = filename.substr(start + 6);
        std::string cleanId = "";
        for(char c : rawId) {
            if (cleanId.length() < 24 && isalnum(c)) cleanId += c;
            else if (cleanId.length() == 24) break;
        }
        return cleanId;
    }
    return "";
}

void send_ws_text(const std::string &data) {
    std::lock_guard<std::mutex> lock(sendMutex); 
    if (!sslGlobal || !isConnected) return; 
    std::vector<unsigned char> frame;
    frame.push_back(0x81);
    size_t len = data.size();
    if (len <= 125) frame.push_back(0x80 | (unsigned char)len);
    else if (len <= 65535) {
        frame.push_back(0x80 | 126);
        frame.push_back((len >> 8) & 0xFF); frame.push_back(len & 0xFF);
    } else {
        frame.push_back(0x80 | 127);
        for (int i = 7; i >= 0; i--) frame.push_back((len >> (i * 8)) & 0xFF);
    }
    unsigned char mask[4] = { 0x12, 0x34, 0x56, 0x78 };
    frame.insert(frame.end(), mask, mask + 4);
    for (size_t i = 0; i < len; i++) frame.push_back(data[i] ^ mask[i % 4]);
    SSL_write(sslGlobal, (char *)frame.data(), (int)frame.size());
}

void send_socketio_event(const std::string &event, json payload) {
    std::string s = "42[\"" + event + "\"," + payload.dump() + "]";
    send_ws_text(s);
}

void handle_control(json event) {
    try {
        std::lock_guard<std::mutex> lock(inputMutex); 
        if (!event.contains("type")) return;
        std::string type = event["type"];

        if (type == "keydown" || type == "keyup") {
            int vk = event["keyCode"].get<int>();
            INPUT input = {0};
            input.type = INPUT_KEYBOARD;
            input.ki.wVk = (WORD)vk;
            input.ki.dwFlags = (type == "keyup") ? KEYEVENTF_KEYUP : 0;
            SendInput(1, &input, sizeof(INPUT));
        } else if (event.contains("x") && event.contains("y")) {
            double xRatio = event["x"].get<double>();
            double yRatio = event["y"].get<double>();
            int absX = (int)(xRatio * 65535.0f);
            int absY = (int)(yRatio * 65535.0f);
            
            INPUT input = {0};
            input.type = INPUT_MOUSE;
            input.mi.dx = absX; input.mi.dy = absY;
            input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK;
            SendInput(1, &input, sizeof(INPUT));

            if (type == "mousedown") {
                input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_VIRTUALDESK;
                SendInput(1, &input, sizeof(INPUT));
            } else if (type == "mouseup") {
                input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTUP | MOUSEEVENTF_VIRTUALDESK;
                SendInput(1, &input, sizeof(INPUT));
            } else if (type == "contextmenu") {
                input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_RIGHTDOWN | MOUSEEVENTF_VIRTUALDESK;
                SendInput(1, &input, sizeof(INPUT));
                input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_RIGHTUP | MOUSEEVENTF_VIRTUALDESK;
                SendInput(1, &input, sizeof(INPUT));
            } else if (type == "dblclick") {
                input.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP | MOUSEEVENTF_VIRTUALDESK;
                SendInput(1, &input, sizeof(INPUT));
                SendInput(1, &input, sizeof(INPUT));
            }
        }
    } catch (...) {}
}

void websocket_receive_loop() {
    char buffer[131072]; 
    while (isConnected && sslGlobal) {
        int r = SSL_read(sslGlobal, buffer, sizeof(buffer) - 1);
        if (r <= 0) { isConnected = false; break; }
        buffer[r] = '\0';
        std::string raw(buffer);
        if (raw.find("2") != std::string::npos) { send_ws_text("3"); } 
        size_t startPos = raw.find("[");
        if (startPos != std::string::npos) {
            try {
                auto j = json::parse(raw.substr(startPos));
                if (j.is_array() && j.size() >= 2) {
                    std::string eventName = j[0].get<std::string>();
                    if (eventName == "receive-control-input") {
                        if (j[1].contains("event")) handle_control(j[1]["event"]);
                        else handle_control(j[1]);
                    } else if (eventName == "start-sharing") {
                        targetViewerId = j[1]["targetId"].get<std::string>();
                        std::cout << "🎯 LIVE! Streaming to: " << targetViewerId << std::endl;
                    }
                }
            } catch (...) {}
        }
    }
}

void init_jpeg() {
    UINT num, size; GetImageEncodersSize(&num, &size);
    ImageCodecInfo* p = (ImageCodecInfo*)(malloc(size));
    GetImageEncoders(num, size, p);
    for (UINT j = 0; j < num; ++j) {
        if (wcscmp(p[j].MimeType, L"image/jpeg") == 0) { jpegClsid = p[j].Clsid; break; }
    }
    free(p);
}

std::string base64_encode(const unsigned char *data, int len) {
    static const char tbl[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out; int val = 0, valb = -6;
    for (int i = 0; i < len; i++) {
        val = (val << 8) + data[i]; valb += 8;
        while (valb >= 0) { out.push_back(tbl[(val >> valb) & 63]); valb -= 6; }
    }
    if (valb > -6) out.push_back(tbl[((val << 8) >> (valb + 8)) & 63]);
    while (out.size() % 4) out.push_back('=');
    return out;
}

int main() {
    // 🔥 LINE 185 PERMANENT FIX: Dynamic Loading User32.dll
    HMODULE hUser32 = GetModuleHandleA("user32.dll");
    if (hUser32) {
        SetProcessDpiAwarenessContextProc setDpiAware = 
            (SetProcessDpiAwarenessContextProc)GetProcAddress(hUser32, "SetProcessDpiAwarenessContext");
        if (setDpiAware) {
            setDpiAware(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }

    std::cout << "--- Agent v8.1 FINAL DEPLOY ---" << std::endl;
    agentUserId = get_id_from_filename();
    
    GdiplusStartupInput gpsi; ULONG_PTR token; GdiplusStartup(&token, &gpsi, NULL);
    init_jpeg(); 
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);

    SSL_library_init();
    SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());

    while (true) {
        sockGlobal = socket(AF_INET, SOCK_STREAM, 0);
        struct hostent *he = gethostbyname(RENDER_HOST.c_str());
        if (!he) { Sleep(3000); continue; }
        sockaddr_in addr = { AF_INET, htons(RENDER_PORT) }; 
        addr.sin_addr = *((struct in_addr *)he->h_addr);

        if (connect(sockGlobal, (sockaddr *)&addr, sizeof(addr)) == 0) {
            sslGlobal = SSL_new(ctx);
            SSL_set_fd(sslGlobal, sockGlobal);
            if (SSL_connect(sslGlobal) <= 0) {
                SSL_free(sslGlobal); closesocket(sockGlobal);
                Sleep(3000); continue;
            }

            std::string req = "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: " + RENDER_HOST + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
            SSL_write(sslGlobal, req.c_str(), (int)req.size());
            
            char buf[4096]; 
            int bytes = SSL_read(sslGlobal, buf, sizeof(buf)); 
            send_ws_text("40"); 
            
            isConnected = true;
            std::cout << "✅ SECURE CONNECTED! ID: " << agentUserId << std::endl;
            std::thread(websocket_receive_loop).detach();
            send_socketio_event("user-online", {{"userId", agentUserId}, {"name", "Agent Sharer"}});

            while (isConnected) {
                if (!targetViewerId.empty()) {
                    HDC hScreen = GetDC(NULL); HDC hDC = CreateCompatibleDC(hScreen);
                    int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN);
                    HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, sw, sh);
                    SelectObject(hDC, hBitmap);
                    BitBlt(hDC, 0, 0, sw, sh, hScreen, 0, 0, SRCCOPY);
                    
                    IStream *stream = NULL; CreateStreamOnHGlobal(NULL, TRUE, &stream);
                    EncoderParameters ep; ep.Count = 1; ep.Parameter[0].Guid = EncoderQuality;
                    ep.Parameter[0].Type = EncoderParameterValueTypeLong; ep.Parameter[0].NumberOfValues = 1;
                    ULONG q = 35; ep.Parameter[0].Value = &q; 
                    
                    Bitmap bmp(hBitmap, NULL); bmp.Save(stream, &jpegClsid, &ep);
                    HGLOBAL hMem; GetHGlobalFromStream(stream, &hMem);
                    SIZE_T size = GlobalSize(hMem); void *data = GlobalLock(hMem);
                    
                    json update; 
                    update["senderId"] = agentUserId; 
                    update["targetId"] = targetViewerId; 
                    update["image"] = base64_encode((unsigned char*)data, (int)size);
                    
                    GlobalUnlock(hMem); stream->Release(); 
                    DeleteObject(hBitmap); DeleteDC(hDC); ReleaseDC(NULL, hScreen);
                    
                    send_socketio_event("screen-update", update);
                    Sleep(300); 
                } else {
                    send_ws_text("2"); 
                    Sleep(5000);
                }
            }
        }
        isConnected = false; targetViewerId = "";
        if(sslGlobal) { SSL_shutdown(sslGlobal); SSL_free(sslGlobal); sslGlobal = nullptr; }
        closesocket(sockGlobal);
        std::cout << "🔄 Reconnecting..." << std::endl;
        Sleep(3000);
    }
    return 0;
}