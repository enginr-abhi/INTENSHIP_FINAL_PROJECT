#include <winsock2.h>
#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <vector>
#include <thread>
#include <string>
#include <mutex> 
#include <algorithm>
#include "json.hpp" 

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "ole32.lib")

#ifndef DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
#define DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((HANDLE)-4)
#endif
extern "C" BOOL WINAPI SetProcessDpiAwarenessContext(HANDLE value);

using namespace Gdiplus;
using json = nlohmann::json;

// --- CONFIGURATION ---
const std::string RENDER_HOST = "intenship-final-project.onrender.com";
const std::string RENDER_PORT = "80"; // Render uses port 80 for HTTP/WS

// Global Variables
SOCKET sockGlobal;
bool isConnected = false;
std::string targetViewerId = ""; 
std::string agentUserId = "";    
CLSID jpegClsid;
std::mutex sendMutex; 
std::mutex inputMutex; 

// --- Helper Functions ---
std::string get_id_from_filename() {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    std::string fullPath = path;
    size_t lastSlash = fullPath.find_last_of("\\/");
    std::string filename = (lastSlash == std::string::npos) ? fullPath : fullPath.substr(lastSlash + 1);
    size_t start = filename.find("agent_");
    size_t end = filename.find(".exe");
    if (start != std::string::npos && end != std::string::npos) {
        std::string rawId = filename.substr(start + 6, end - (start + 6));
        size_t extraPos = rawId.find_first_of(" ("); 
        if (extraPos != std::string::npos) rawId = rawId.substr(0, extraPos);
        return rawId;
    }
    return "";
}

std::string get_user_id_from_url(const std::string &url) {
    size_t start_pos = url.find("user_id=");
    if (start_pos == std::string::npos) return "";
    start_pos += 8;
    size_t end_pos = url.find_first_of("&\"", start_pos);
    return url.substr(start_pos, (end_pos == std::string::npos) ? url.length() - start_pos : end_pos - start_pos);
}

void send_ws_text(const std::string &data) {
    std::lock_guard<std::mutex> lock(sendMutex); 
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
    send(sockGlobal, (char *)frame.data(), (int)frame.size(), 0);
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
            if (event.contains("keyCode")) {
                int vk = event["keyCode"].get<int>();
                INPUT input = {0};
                input.type = INPUT_KEYBOARD;
                input.ki.wVk = (WORD)vk;
                input.ki.dwFlags = (type == "keyup") ? KEYEVENTF_KEYUP : 0;
                SendInput(1, &input, sizeof(INPUT));
            }
            return; 
        }

        if (event.contains("x") && event.contains("y")) {
            double xRatio = event["x"].get<double>();
            double yRatio = event["y"].get<double>();
            xRatio = (std::max)(0.0, (std::min)(1.0, xRatio));
            yRatio = (std::max)(0.0, (std::min)(1.0, yRatio));
            
            int absX = (int)(xRatio * 65535.0f);
            int absY = (int)(yRatio * 65535.0f);

            INPUT input = {0};
            input.type = INPUT_MOUSE;
            input.mi.dx = absX;
            input.mi.dy = absY;
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
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
                SendInput(1, &input, sizeof(INPUT));
            }
        }
    } catch (...) {}
}

void websocket_receive_loop() {
    char buffer[131072]; 
    while (isConnected) {
        int r = recv(sockGlobal, buffer, sizeof(buffer) - 1, 0);
        if (r <= 0) { isConnected = false; break; }
        buffer[r] = '\0';
        std::string raw(buffer);

        if (raw[0] == '2') { send_ws_text("3"); continue; }
        
        if (raw.find("receive-control-input") != std::string::npos) {
            size_t startPos = raw.find("[");
            if (startPos != std::string::npos) {
                try {
                    std::string jsonPart = raw.substr(startPos);
                    size_t endPos = jsonPart.find_last_of("]");
                    if (endPos != std::string::npos) {
                        jsonPart = jsonPart.substr(0, endPos + 1);
                        json j = json::parse(jsonPart);
                        if (j.is_array() && j.size() >= 2) {
                            json eventData = j[1];
                            if (eventData.contains("event")) handle_control(eventData["event"]);
                            else handle_control(eventData);
                        }
                    }
                } catch (...) {}
            }
        } else if (raw.find("start-sharing") != std::string::npos) {
            size_t pos = raw.find("[");
            if (pos != std::string::npos) {
                try {
                    std::string jStr = raw.substr(pos);
                    json j = json::parse(jStr);
                    targetViewerId = j[1]["targetId"].get<std::string>();
                    std::cout << "📢 Connected to Viewer: " << targetViewerId << std::endl;
                } catch(...) {}
            }
        }
    }
}

void init_jpeg() {
    UINT num, size; GetImageEncodersSize(&num, &size);
    if (size == 0) return;
    ImageCodecInfo* pImageCodecInfo = (ImageCodecInfo*)(malloc(size));
    GetImageEncoders(num, size, pImageCodecInfo);
    for (UINT j = 0; j < num; ++j) {
        if (wcscmp(pImageCodecInfo[j].MimeType, L"image/jpeg") == 0) {
            jpegClsid = pImageCodecInfo[j].Clsid; break;
        }
    }
    free(pImageCodecInfo);
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

int main(int argc, char *argv[]) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2); 
    
    std::cout << "--- Agent v4.1 LIVE (Render Version) ---" << std::endl;
    if (argc > 1) agentUserId = get_user_id_from_url(argv[1]);
    if (agentUserId.empty()) agentUserId = get_id_from_filename();
    
    if (agentUserId.empty()) {
        std::cout << "❌ Error: ID Mismatch." << std::endl;
        Sleep(3000); return 1;
    }

    GdiplusStartupInput gpsi; ULONG_PTR token; GdiplusStartup(&token, &gpsi, NULL);
    init_jpeg();
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);

    while (true) {
        sockGlobal = socket(AF_INET, SOCK_STREAM, 0);
        
        // --- RENDER DNS RESOLUTION ---
        struct hostent *he = gethostbyname(RENDER_HOST.c_str());
        if (!he) {
            std::cout << "🔄 DNS Fail. Retrying..." << std::endl;
            Sleep(3000); continue;
        }

        sockaddr_in addr = { AF_INET, htons(80) }; 
        addr.sin_addr = *((struct in_addr *)he->h_addr);

        if (connect(sockGlobal, (sockaddr *)&addr, sizeof(addr)) == 0) {
            // Handshake with Render Host Header
            std::string req = "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\n"
                              "Host: " + RENDER_HOST + "\r\n"
                              "Upgrade: websocket\r\n"
                              "Connection: Upgrade\r\n"
                              "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                              "Sec-WebSocket-Version: 13\r\n\r\n";
            
            send(sockGlobal, req.c_str(), (int)req.size(), 0);
            char buf[1024]; recv(sockGlobal, buf, 1024, 0);
            
            send_ws_text("40"); 
            isConnected = true;
            std::cout << "🚀 ONLINE ON RENDER: " << agentUserId << std::endl;

            std::thread(websocket_receive_loop).detach();
            send_socketio_event("user-online", {{"userId", agentUserId}, {"name", "Agent Sharer"}});

            while (isConnected) {
                if (!targetViewerId.empty()) {
                    HDC hScreen = GetDC(NULL); 
                    HDC hDC = CreateCompatibleDC(hScreen);
                    int sw = GetSystemMetrics(SM_CXSCREEN);
                    int sh = GetSystemMetrics(SM_CYSCREEN);
                    HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, sw, sh);
                    SelectObject(hDC, hBitmap);
                    BitBlt(hDC, 0, 0, sw, sh, hScreen, 0, 0, SRCCOPY);
                    
                    IStream *stream = NULL; 
                    CreateStreamOnHGlobal(NULL, TRUE, &stream);
                    EncoderParameters ep; ep.Count = 1;
                    ep.Parameter[0].Guid = EncoderQuality;
                    ep.Parameter[0].Type = EncoderParameterValueTypeLong;
                    ep.Parameter[0].NumberOfValues = 1;
                    ULONG q = 35; 
                    ep.Parameter[0].Value = &q;

                    Bitmap bmp(hBitmap, NULL);
                    bmp.Save(stream, &jpegClsid, &ep);
                    
                    HGLOBAL hMem; 
                    GetHGlobalFromStream(stream, &hMem);
                    SIZE_T size = GlobalSize(hMem);
                    void *data = GlobalLock(hMem);
                    
                    json update;
                    update["senderId"] = agentUserId;
                    update["targetId"] = targetViewerId;
                    update["image"] = base64_encode((unsigned char*)data, (int)size);
                    
                    GlobalUnlock(hMem); stream->Release(); 
                    DeleteObject(hBitmap); DeleteDC(hDC); 
                    ReleaseDC(NULL, hScreen);
                    
                    send_socketio_event("screen-update", update);
                    std::this_thread::sleep_for(std::chrono::milliseconds(300)); 
                } else {
                    std::this_thread::sleep_for(std::chrono::milliseconds(500));
                }
            }
            closesocket(sockGlobal);
        } else {
            std::cout << "🔄 Render Connection failed. Retrying in 3s..." << std::endl;
            Sleep(3000);
        }
    }
    GdiplusShutdown(token); 
    return 0;
}