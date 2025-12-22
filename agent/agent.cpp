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

using namespace Gdiplus;
using json = nlohmann::json;

SOCKET sockGlobal;
bool isConnected = false;
std::string targetViewerId = ""; 
std::string agentUserId = "";    
CLSID jpegClsid;
std::mutex sendMutex; 

// --- Helper: ID from Filename ---
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

// --- Helper: ID from URL ---
std::string get_user_id_from_url(const std::string &url) {
    size_t start_pos = url.find("user_id=");
    if (start_pos == std::string::npos) return "";
    start_pos += 8;
    size_t end_pos = url.find_first_of("&\"", start_pos);
    return url.substr(start_pos, (end_pos == std::string::npos) ? url.length() - start_pos : end_pos - start_pos);
}

// --- WebSocket Framing ---
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

// --- 🚀 THE FINAL CONTROL FIX ---
void handle_control(json event) {
    try {
        std::string type = event["type"];
        
        if (event.contains("x") && event.contains("y")) {
            double xRatio = event["x"].get<double>();
            double yRatio = event["y"].get<double>();

            // Windows Absolute Coordinate System (0 to 65535)
            // Isse DPI/Scaling ka issue solve ho jata hai
            int absX = (int)(xRatio * 65535.0f);
            int absY = (int)(yRatio * 65535.0f);

            std::cout << "🖱️ [ACTION] " << type << " at " << xRatio << "," << yRatio << std::endl;

            // Move cursor to absolute position
            mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, absX, absY, 0, 0);

            if (type == "mousedown") {
                mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTDOWN, absX, absY, 0, 0);
            }
            else if (type == "mouseup") {
                mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTUP, absX, absY, 0, 0);
            }
            else if (type == "contextmenu") { 
                mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_RIGHTDOWN | MOUSEEVENTF_RIGHTUP, absX, absY, 0, 0);
            }
            else if (type == "dblclick") {
                mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, absX, absY, 0, 0);
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
                mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, absX, absY, 0, 0);
            }
        } 
        else if (type == "keydown") {
            int vk = event.value("keyCode", 0);
            if (vk > 0) keybd_event((BYTE)vk, 0, 0, 0);
        } 
        else if (type == "keyup") {
            int vk = event.value("keyCode", 0);
            if (vk > 0) keybd_event((BYTE)vk, 0, KEYEVENTF_KEYUP, 0);
        }
    } catch (...) {
        std::cout << "⚠️ Error processing control input" << std::endl;
    }
}

// --- GDI+ Setup & Image Encoding ---
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

// --- WebSocket Receive Loop ---
void websocket_receive_loop() {
    char buffer[65536]; 
    while (isConnected) {
        int r = recv(sockGlobal, buffer, sizeof(buffer) - 1, 0);
        if (r <= 0) { isConnected = false; break; }
        buffer[r] = '\0';
        std::string raw(buffer);

        if (raw[0] == '2') { send_ws_text("3"); continue; }
        
        size_t pos = raw.find("[");
        if (pos != std::string::npos) {
            try {
                // FIXED: Using :: instead of . for parse
                json j = json::parse(raw.substr(pos));
                if (j.is_array() && j.size() >= 2) {
                    std::string ev = j[0].get<std::string>();
                    if (ev == "start-sharing") {
                        targetViewerId = j[1]["targetId"].get<std::string>();
                        std::cout << "📢 Connected to Viewer: " << targetViewerId << std::endl;
                    }
                    if (ev == "receive-control-input") {
                        if (j[1].contains("event")) handle_control(j[1]["event"]);
                    }
                }
            } catch (...) {}
        }
    }
}

// --- Main Function ---
int main(int argc, char *argv[]) {
    // 🔥 Important for modern high-res screens
    SetProcessDPIAware(); 

    std::cout << "--- Starting ScreenShare Agent (v4.0 Final) ---" << std::endl;
    if (argc > 1) agentUserId = get_user_id_from_url(argv[1]);
    if (agentUserId.empty()) agentUserId = get_id_from_filename();
    
    if (agentUserId.empty()) {
        std::cout << "❌ Error: ID not found." << std::endl;
        Sleep(5000); return 1;
    }

    GdiplusStartupInput gpsi; ULONG_PTR token; GdiplusStartup(&token, &gpsi, NULL);
    init_jpeg();
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);

    while (true) {
        sockGlobal = socket(AF_INET, SOCK_STREAM, 0);
        sockaddr_in addr = { AF_INET, htons(8000) }; 
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");

        if (connect(sockGlobal, (sockaddr *)&addr, sizeof(addr)) == 0) {
            std::string req = "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: localhost:8000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
            send(sockGlobal, req.c_str(), (int)req.size(), 0);
            char buf[1024]; recv(sockGlobal, buf, 1024, 0);
            send_ws_text("40"); 
            isConnected = true;
            std::cout << "🚀 AGENT ONLINE: " << agentUserId << std::endl;

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
                    ULONG q = 30; ep.Parameter[0].Value = &q;

                    Bitmap bmp(hBitmap, NULL); bmp.Save(stream, &jpegClsid, &ep);
                    HGLOBAL hMem; GetHGlobalFromStream(stream, &hMem);
                    SIZE_T size = GlobalSize(hMem); void *data = GlobalLock(hMem);
                    
                    json update;
                    update["senderId"] = agentUserId;
                    update["targetId"] = targetViewerId;
                    update["image"] = base64_encode((unsigned char*)data, (int)size);
                    
                    GlobalUnlock(hMem); stream->Release(); DeleteObject(hBitmap); DeleteDC(hDC); ReleaseDC(NULL, hScreen);
                    
                    send_socketio_event("screen-update", update);
                    std::this_thread::sleep_for(std::chrono::milliseconds(150)); 
                } else std::this_thread::sleep_for(std::chrono::milliseconds(500));
            }
            closesocket(sockGlobal);
        } else {
            std::cout << "❌ Retrying connection in 5s..." << std::endl;
            Sleep(5000);
        }
    }
    GdiplusShutdown(token); return 0;
}