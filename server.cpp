
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <algorithm>
#include <iomanip>
#include <ctime>
#include <cstdlib>
#include <winsock2.h>
#include <ws2tcpip.h>

using namespace std;

struct Expense {
    int id;
    string title, category, date;
    double amount;
};

vector<Expense> expenses;
int nextId = 1;

string csvEscape(string s) {
    string out = "\"";
    for (char c : s) {
        if (c == '"') out += "\"\"";
        else out += c;
    }
    return out + "\"";
}

string jsonEscape(const string& s) {
    string out;
    for (char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else if (c != '\r') out += c;
    }
    return out;
}

string lower(string s) {
    transform(s.begin(), s.end(), s.begin(),
        [](unsigned char c) { return (char)tolower(c); });
    return s;
}

void saveExpenses() {
    ofstream file("expenses.csv");
    file << "id,title,amount,category,date\n";
    for (const auto& e : expenses) {
        file << e.id << "," << csvEscape(e.title) << ","
             << e.amount << "," << csvEscape(e.category) << ","
             << csvEscape(e.date) << "\n";
    }
}

string readField(stringstream& ss) {
    string result;
    if (ss.peek() == '"') {
        ss.get();
        char c;
        while (ss.get(c)) {
            if (c == '"') {
                if (ss.peek() == '"') {
                    ss.get();
                    result += '"';
                } else break;
            } else result += c;
        }
        if (ss.peek() == ',') ss.get();
    } else {
        getline(ss, result, ',');
    }
    return result;
}

void loadExpenses() {
    ifstream file("expenses.csv");
    string line;
    if (!file) return;

    getline(file, line); // header
    while (getline(file, line)) {
        stringstream ss(line);
        Expense e;
        string amount;

        string id = readField(ss);
        e.title = readField(ss);
        amount = readField(ss);
        e.category = readField(ss);
        e.date = readField(ss);

        try {
            e.id = stoi(id);
            e.amount = stod(amount);
            expenses.push_back(e);
            nextId = max(nextId, e.id + 1);
        } catch (...) {
            // Ignore invalid rows.
        }
    }
}

string jsonExpenses() {
    ostringstream out;
    out << "[";
    for (size_t i = 0; i < expenses.size(); i++) {
        if (i) out << ",";
        const auto& e = expenses[i];
        out << "{\"id\":" << e.id
            << ",\"title\":\"" << jsonEscape(e.title)
            << "\",\"amount\":" << e.amount
            << ",\"category\":\"" << jsonEscape(e.category)
            << "\",\"date\":\"" << jsonEscape(e.date) << "\"}";
    }
    out << "]";
    return out.str();
}

string readRequestBody(const string& request) {
    size_t p = request.find("\r\n\r\n");
    if (p == string::npos) return "";
    string body = request.substr(p + 4);

    size_t cl = request.find("Content-Length:");
    if (cl != string::npos && cl < p) {
        size_t start = cl + 15;
        while (start < request.size() && request[start] == ' ') start++;
        size_t end = request.find("\r\n", start);
        int len = 0;
        try { len = stoi(request.substr(start, end - start)); }
        catch (...) { return ""; }
        if (len >= 0 && body.size() > (size_t)len)
            body.resize(len);
    }
    return body;
}

string jsonString(const string& body, const string& key) {
    string needle = "\"" + key + "\"";
    size_t p = body.find(needle);
    if (p == string::npos) return "";
    p = body.find(':', p + needle.size());
    if (p == string::npos) return "";
    p = body.find('"', p + 1);
    if (p == string::npos) return "";

    string result;
    bool escape = false;
    for (size_t i = p + 1; i < body.size(); i++) {
        char c = body[i];
        if (escape) {
            if (c == 'n') result += '\n';
            else result += c;
            escape = false;
        } else if (c == '\\') escape = true;
        else if (c == '"') return result;
        else result += c;
    }
    return "";
}

double jsonNumber(const string& body, const string& key) {
    string needle = "\"" + key + "\"";
    size_t p = body.find(needle);
    if (p == string::npos) return 0;
    p = body.find(':', p + needle.size());
    if (p == string::npos) return 0;
    try { return stod(body.substr(p + 1)); }
    catch (...) { return 0; }
}

string response(const string& body, const string& type = "application/json",
                const string& status = "200 OK") {
    return "HTTP/1.1 " + status + "\r\n"
           "Content-Type: " + type + "; charset=utf-8\r\n"
           "Access-Control-Allow-Origin: *\r\n"
           "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
           "Access-Control-Allow-Headers: Content-Type\r\n"
           "Connection: close\r\n"
           "Content-Length: " + to_string(body.size()) + "\r\n\r\n" + body;
}

string mimeType(const string& path) {
    if (path == "/") return "text/html";
    if (path.size() >= 4 && path.substr(path.size() - 4) == ".css")
    return "text/css";

    if (path.size() >= 3 && path.substr(path.size() - 3) == ".js")
    return "application/javascript";
    return "text/plain";
}

string readFile(const string& name) {
    ifstream file(name, ios::binary);
    if (!file) return "";
    ostringstream out;
    out << file.rdbuf();
    return out.str();
}

void handleClient(SOCKET client) {
    string request;
    char buffer[8192];

    // Read headers first, then any request body.
    size_t headerEnd = string::npos;
    size_t contentLength = 0;

    while (request.size() < 1024 * 1024) {
        int n = recv(client, buffer, sizeof(buffer), 0);
        if (n <= 0) break;
        request.append(buffer, n);

        headerEnd = request.find("\r\n\r\n");
        if (headerEnd != string::npos) {
            size_t p = request.find("Content-Length:");
            if (p != string::npos && p < headerEnd) {
                size_t start = p + 15;
                while (start < request.size() && request[start] == ' ')
                    start++;
                try { contentLength = stoi(request.substr(start)); }
                catch (...) { contentLength = 0; }
            }
            if (request.size() >= headerEnd + 4 + contentLength) break;
        }
    }

    size_t lineEnd = request.find("\r\n");
    if (lineEnd == string::npos) {
        string r = response("Bad request", "text/plain", "400 Bad Request");
        send(client, r.c_str(), (int)r.size(), 0);
        closesocket(client);
        return;
    }

    stringstream first(request.substr(0, lineEnd));
    string method, path, version;
    first >> method >> path >> version;

    if (method == "OPTIONS") {
        string r = response("", "text/plain", "204 No Content");
        send(client, r.c_str(), (int)r.size(), 0);
        closesocket(client);
        return;
    }

    size_t q = path.find('?');
    if (q != string::npos) path.resize(q);

    string body = readRequestBody(request);
    string result;
    string status = "200 OK";
    string type = "application/json";

    if (method == "GET" && (path == "/" || path == "/index.html" ||
                            path == "/style.css" || path == "/script.js")) {
        string filename = path == "/" ? "index.html" : path.substr(1);
        result = readFile(filename);
        type = mimeType(path);
        if (result.empty()) status = "404 Not Found";
    }
    else if (method == "GET" && path == "/api/expenses") {
        result = jsonExpenses();
    }
    else if (method == "POST" && path == "/api/expenses") {
        Expense e;
        e.id = nextId++;
        e.title = jsonString(body, "title");
        e.category = jsonString(body, "category");
        e.date = jsonString(body, "date");
        e.amount = jsonNumber(body, "amount");

        if (e.title.empty() || e.amount <= 0 || e.date.empty()) {
            result = "{\"error\":\"Enter a title, positive amount and date\"}";
            status = "400 Bad Request";
        } else {
            expenses.push_back(e);
            saveExpenses();
            result = "{\"success\":true,\"id\":" + to_string(e.id) + "}";
        }
    }
        else if (method == "PUT" && path.rfind("/api/expenses/", 0) == 0) {
        int id = 0;

        try {
            id = stoi(path.substr(14));
        } catch (...) {}

        auto it = find_if(expenses.begin(), expenses.end(),
            [id](const Expense& e) { return e.id == id; });

        if (it == expenses.end()) {
            result = "{\"error\":\"Expense not found\"}";
            status = "404 Not Found";
        } else {
            string title = jsonString(body, "title");
            string category = jsonString(body, "category");
            string date = jsonString(body, "date");
            double amount = jsonNumber(body, "amount");

            if (title.empty() || amount <= 0 || date.empty()) {
                result = "{\"error\":\"Enter a title, positive amount and date\"}";
                status = "400 Bad Request";
            } else {
                it->title = title;
                it->category = category;
                it->date = date;
                it->amount = amount;

                saveExpenses();
                result = "{\"success\":true}";
            }
        }
    }
    else if (method == "DELETE" && path.rfind("/api/expenses/", 0) == 0) {
        int id = 0;
        try { id = stoi(path.substr(14)); } catch (...) {}
        auto oldSize = expenses.size();
        expenses.erase(remove_if(expenses.begin(), expenses.end(),
            [id](const Expense& e) { return e.id == id; }), expenses.end());

        if (oldSize == expenses.size()) {
            result = "{\"error\":\"Expense not found\"}";
            status = "404 Not Found";
        } else {
            saveExpenses();
            result = "{\"success\":true}";
        }
    }
    else {
        result = "{\"error\":\"Not found\"}";
        status = "404 Not Found";
    }

    string r = response(result, type, status);
    send(client, r.c_str(), (int)r.size(), 0);
    closesocket(client);
}

int main() {
    loadExpenses();

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        cerr << "Could not initialize Windows networking.\n";
        return 1;
    }

    SOCKET server = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (server == INVALID_SOCKET) {
        cerr << "Could not create server socket.\n";
        WSACleanup();
        return 1;
    }

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(18080);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

    if (bind(server, (sockaddr*)&address, sizeof(address)) == SOCKET_ERROR) {
        cerr << "Port 18080 is busy. Close the previous server first.\n";
        closesocket(server);
        WSACleanup();
        return 1;
    }

    listen(server, 10);
    cout << "Expense Tracker running at http://localhost:18080\n";
    cout << "Keep this terminal open. Press Ctrl+C to stop.\n";

    while (true) {
        SOCKET client = accept(server, nullptr, nullptr);
        if (client != INVALID_SOCKET) handleClient(client);
    }

    closesocket(server);
    WSACleanup();
    return 0;
}
