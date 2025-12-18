#include <winsock2.h>
#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <vector>
#include <thread>
#include <string>
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

std::string get_user_id_from_url(const std::string &url) {
    size_t start_pos = url.find("user_id=");
    if (start_pos == std::string::npos) return "";
    start_pos += 8;
    size_t end_pos = url.find_first_of("&\"", start_pos);
    return url.substr(start_pos, (end_pos == std::string::npos) ? url.length() - start_pos : end_pos - start_pos);
}

void send_ws_text(const std::string &data) {
    std::vector<unsigned char> frame;
    frame.push_back(0x81);
    size_t len = data.size();
    if (len <= 125) {
        frame.push_back(0x80 | (unsigned char)len);
    } else if (len <= 65535) {
        frame.push_back(0x80 | 126);
        frame.push_back((len >> 8) & 0xFF);
        frame.push_back(len & 0xFF);
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
        std::string type = event["type"];
        int sw = GetSystemMetrics(SM_CXSCREEN);
        int sh = GetSystemMetrics(SM_CYSCREEN);
        if (type == "mousemove") {
            int x = (int)(event["x"].get<double>() * sw / event["w"].get<double>());
            int y = (int)(event["y"].get<double>() * sh / event["h"].get<double>());
            SetCursorPos(x, y);
        } else if (type == "mousedown") mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        else if (type == "mouseup") mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        else if (type == "keydown") keybd_event((BYTE)event["keyCode"].get<int>(), 0, 0, 0);
        else if (type == "keyup") keybd_event((BYTE)event["keyCode"].get<int>(), 0, KEYEVENTF_KEYUP, 0);
    } catch (...) {}
}

void init_jpeg() {
    UINT num, size;
    GetImageEncodersSize(&num, &size);
    if (size == 0) return;
    ImageCodecInfo* pImageCodecInfo = (ImageCodecInfo*)(malloc(size));
    GetImageEncoders(num, size, pImageCodecInfo);
    for (UINT j = 0; j < num; ++j) {
        if (wcscmp(pImageCodecInfo[j].MimeType, L"image/jpeg") == 0) {
            jpegClsid = pImageCodecInfo[j].Clsid;
            free(pImageCodecInfo);
            return;
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

void websocket_receive_loop() {
    char buffer[16384];
    while (isConnected) {
        int r = recv(sockGlobal, buffer, sizeof(buffer) - 1, 0);
        if (r <= 0) { isConnected = false; break; }
        buffer[r] = '\0';
        std::string raw(buffer);

        if (raw.find("2") == 0) { send_ws_text("3"); continue; }

        if (raw.find("start-sharing") != std::string::npos) {
            size_t start = raw.find('{');
            size_t end = raw.find_last_of('}');
            if (start != std::string::npos && end > start) {
                try {
                    json j = json::parse(raw.substr(start, end - start + 1));
                    if (j.contains("targetId")) {
                        targetViewerId = j["targetId"].get<std::string>();
                        std::cout << "✅ Target Viewer Set To: " << targetViewerId << "\n";
                    }
                } catch(...) {}
            }
        }
        if (raw.find("receive-control-input") != std::string::npos) {
            size_t start = raw.find('{');
            size_t end = raw.find_last_of('}');
            if (start != std::string::npos && end > start) {
                try {
                    json j = json::parse(raw.substr(start, end - start + 1));
                    if(j.contains("event")) handle_control(j["event"]);
                } catch(...) {}
            }
        }
    }
}

int main(int argc, char *argv[]) {
    if (argc > 1) agentUserId = get_user_id_from_url(argv[1]);
    if (agentUserId.empty()) { std::cout << "❌ Error: ID missing!\n"; return 1; }

    GdiplusStartupInput gpsi; ULONG_PTR token; GdiplusStartup(&token, &gpsi, NULL);
    init_jpeg();
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);
    sockGlobal = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr = { AF_INET, htons(8000) }; addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (connect(sockGlobal, (sockaddr *)&addr, sizeof(addr)) == 0) {
        std::string req = "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: localhost:8000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
        send(sockGlobal, req.c_str(), (int)req.size(), 0);
        char buf[1024]; recv(sockGlobal, buf, 1024, 0);
        send_ws_text("40"); 
        isConnected = true;
        std::cout << "🚀 Agent Ready. ID: " << agentUserId << "\n";

        std::thread(websocket_receive_loop).detach();
        send_socketio_event("user-online", {{"userId", agentUserId}, {"name", "Agent Sharer"}});

        while (isConnected) {
            if (!targetViewerId.empty()) {
                HDC hScreen = GetDC(NULL); HDC hDC = CreateCompatibleDC(hScreen);
                int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN);
                HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, sw, sh);
                SelectObject(hDC, hBitmap);
                BitBlt(hDC, 0, 0, sw, sh, hScreen, 0, 0, SRCCOPY);
                
                IStream *stream = NULL;
                CreateStreamOnHGlobal(NULL, TRUE, &stream);
                EncoderParameters ep; ep.Count = 1; ep.Parameter[0].Guid = EncoderQuality;
                ep.Parameter[0].Type = EncoderParameterValueTypeLong; ep.Parameter[0].NumberOfValues = 1;
                ULONG q = 40; ep.Parameter[0].Value = &q;
                
                Bitmap bmp(hBitmap, NULL);
                bmp.Save(stream, &jpegClsid, &ep);
                
                HGLOBAL hMem;
                GetHGlobalFromStream(stream, &hMem);
                SIZE_T size = GlobalSize(hMem);
                void *data = GlobalLock(hMem);
                
                json update;
                update["senderId"] = agentUserId;
                update["targetId"] = targetViewerId;
                update["image"] = "data:image/jpeg;base64," + base64_encode((unsigned char*)data, (int)size);
                
                GlobalUnlock(hMem);
                stream->Release();
                DeleteObject(hBitmap);
                DeleteDC(hDC);
                ReleaseDC(NULL, hScreen);
                
                send_socketio_event("screen-update", update);
                std::this_thread::sleep_for(std::chrono::milliseconds(100)); 
            } else {
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
            }
        }
    }
    GdiplusShutdown(token);
    return 0;
}