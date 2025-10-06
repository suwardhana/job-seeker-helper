<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// Load environment variables
function loadEnv($path) {
    if (!file_exists($path)) {
        return false;
    }
    
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        
        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv(sprintf('%s=%s', $name, $value));
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
    return true;
}

loadEnv(__DIR__ . '/.env');

// MySQL Helper Class
class MySQLHelper {
    private $connection;
    
    public function __construct() {
        $host = getenv('DB_HOST');
        $dbname = getenv('DB_NAME');
        $username = getenv('DB_USER');
        $password = getenv('DB_PASS');
        
        try {
            $this->connection = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
            $this->connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->connection->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } catch(PDOException $e) {
            throw new Exception("Connection failed: " . $e->getMessage());
        }
    }
    
    public function query($sql, $params = []) {
        try {
            $stmt = $this->connection->prepare($sql);
            $stmt->execute($params);
            return $stmt;
        } catch(PDOException $e) {
            throw new Exception("Query failed: " . $e->getMessage());
        }
    }
    
    public function fetchAll($sql, $params = []) {
        $stmt = $this->query($sql, $params);
        return $stmt->fetchAll();
    }
    
    public function fetchOne($sql, $params = []) {
        $stmt = $this->query($sql, $params);
        return $stmt->fetch();
    }
    
    public function insert($table, $data) {
        $columns = implode(',', array_keys($data));
        $placeholders = ':' . implode(', :', array_keys($data));
        $sql = "INSERT INTO $table ($columns) VALUES ($placeholders)";
        $this->query($sql, $data);
        return $this->connection->lastInsertId();
    }
    
    public function update($table, $data, $where, $whereParams = []) {
        $set = [];
        foreach ($data as $key => $value) {
            $set[] = "$key = :$key";
        }
        $setClause = implode(', ', $set);
        $sql = "UPDATE $table SET $setClause WHERE $where";
        $params = array_merge($data, $whereParams);
        return $this->query($sql, $params);
    }
    
    public function delete($table, $where, $params = []) {
        $sql = "DELETE FROM $table WHERE $where";
        return $this->query($sql, $params);
    }
}

// JWT Helper Functions
function generateJWT($payload) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode($payload);
    
    $headerEncoded = base64url_encode($header);
    $payloadEncoded = base64url_encode($payload);
    
    $signature = hash_hmac('sha256', $headerEncoded . "." . $payloadEncoded, getenv('JWT_SECRET'), true);
    $signatureEncoded = base64url_encode($signature);
    
    return $headerEncoded . "." . $payloadEncoded . "." . $signatureEncoded;
}

function verifyJWT($jwt) {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        return false;
    }
    
    $header = base64url_decode($parts[0]);
    $payload = base64url_decode($parts[1]);
    $signature = base64url_decode($parts[2]);
    
    $expectedSignature = hash_hmac('sha256', $parts[0] . "." . $parts[1], getenv('JWT_SECRET'), true);
    
    if (!hash_equals($signature, $expectedSignature)) {
        return false;
    }
    
    $payloadData = json_decode($payload, true);
    if ($payloadData['exp'] < time()) {
        return false;
    }
    
    return $payloadData;
}

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data) {
    return base64_decode(str_pad(strtr($data, '-_', '+/'), strlen($data) % 4, '=', STR_PAD_RIGHT));
}

// Authentication middleware
function requireAuth() {
    $headers = getallheaders();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';
    
    if (!$authHeader || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['error' => 'Authorization token required']);
        exit;
    }
    
    $token = $matches[1];
    $payload = verifyJWT($token);
    
    if (!$payload) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired token']);
        exit;
    }
    
    return $payload;
}

// Response helper
function sendResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// Initialize database
$db = new MySQLHelper();

// Get request method and path
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = str_replace('/jobportal/backend', '', $path); // Adjust based on your setup
$pathParts = explode('/', trim($path, '/'));

try {
    // Routes
    switch ($method) {
        case 'POST':
            if ($pathParts[0] === 'register') {
                // User Registration
                $input = json_decode(file_get_contents('php://input'), true);
                
                if (!$input['email'] || !$input['password'] || !$input['name']) {
                    sendResponse(['error' => 'Email, password, and name are required'], 400);
                }
                
                // Check if user exists
                $existingUser = $db->fetchOne('SELECT id FROM users WHERE email = ?', [$input['email']]);
                if ($existingUser) {
                    sendResponse(['error' => 'User already exists'], 409);
                }
                
                // Hash password and create user
                $hashedPassword = password_hash($input['password'], PASSWORD_DEFAULT);
                $userId = $db->insert('users', [
                    'name' => $input['name'],
                    'email' => $input['email'],
                    'password' => $hashedPassword,
                    'created_at' => date('Y-m-d H:i:s')
                ]);
                
                sendResponse(['message' => 'User registered successfully', 'user_id' => $userId], 201);
                
            } elseif ($pathParts[0] === 'login') {
                // User Login
                $input = json_decode(file_get_contents('php://input'), true);
                
                if (!$input['email'] || !$input['password']) {
                    sendResponse(['error' => 'Email and password are required'], 400);
                }
                
                $user = $db->fetchOne('SELECT * FROM users WHERE email = ?', [$input['email']]);
                
                if (!$user || !password_verify($input['password'], $user['password'])) {
                    sendResponse(['error' => 'Invalid credentials'], 401);
                }
                
                // Generate JWT token
                $payload = [
                    'user_id' => $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'exp' => time() + (24 * 60 * 60) // 24 hours
                ];
                
                $token = generateJWT($payload);
                
                sendResponse([
                    'message' => 'Login successful',
                    'token' => $token,
                    'user' => [
                        'id' => $user['id'],
                        'name' => $user['name'],
                        'email' => $user['email']
                    ]
                ]);
                
            } elseif ($pathParts[0] === 'portals') {
                // Create Portal
                $user = requireAuth();
                $input = json_decode(file_get_contents('php://input'), true);
                
                if (!$input['category'] || !$input['link']) {
                    sendResponse(['error' => 'Category and link are required'], 400);
                }
                
                $portalId = $db->insert('portals', [
                    'category' => $input['category'],
                    'link' => $input['link'],
                    'user_id' => $user['user_id'],
                    'created_at' => date('Y-m-d H:i:s')
                ]);
                
                sendResponse(['message' => 'Portal created successfully', 'portal_id' => $portalId], 201);
            }
            break;
            
        case 'GET':
            if ($pathParts[0] === 'portals') {
                $user = requireAuth();
                
                if (isset($pathParts[1]) && is_numeric($pathParts[1])) {
                    // Get single portal
                    $portal = $db->fetchOne('SELECT * FROM portals WHERE id = ? AND user_id = ?', [$pathParts[1], $user['user_id']]);
                    if (!$portal) {
                        sendResponse(['error' => 'Portal not found'], 404);
                    }
                    sendResponse($portal);
                } else {
                    // Get all user's portals
                    $portals = $db->fetchAll('SELECT * FROM portals WHERE user_id = ? ORDER BY category, created_at DESC', [$user['user_id']]);
                    sendResponse($portals);
                }
            } elseif ($pathParts[0] === 'categories') {
                // Get distinct categories for current user
                $user = requireAuth();
                $categories = $db->fetchAll('SELECT DISTINCT category FROM portals WHERE user_id = ? ORDER BY category', [$user['user_id']]);
                sendResponse(array_column($categories, 'category'));
            }
            break;
            
        case 'PUT':
            if ($pathParts[0] === 'portals' && isset($pathParts[1]) && is_numeric($pathParts[1])) {
                // Update Portal
                $user = requireAuth();
                $portalId = $pathParts[1];
                $input = json_decode(file_get_contents('php://input'), true);
                
                // Check if portal exists and belongs to user
                $portal = $db->fetchOne('SELECT * FROM portals WHERE id = ? AND user_id = ?', [$portalId, $user['user_id']]);
                if (!$portal) {
                    sendResponse(['error' => 'Portal not found or access denied'], 404);
                }
                
                $updateData = [];
                if (isset($input['category'])) $updateData['category'] = $input['category'];
                if (isset($input['link'])) $updateData['link'] = $input['link'];
                $updateData['updated_at'] = date('Y-m-d H:i:s');
                
                $db->update('portals', $updateData, 'id = ?', [$portalId]);
                sendResponse(['message' => 'Portal updated successfully']);
            }
            break;
            
        case 'DELETE':
            if ($pathParts[0] === 'portals' && isset($pathParts[1]) && is_numeric($pathParts[1])) {
                // Delete Portal
                $user = requireAuth();
                $portalId = $pathParts[1];
                
                // Check if portal exists and belongs to user
                $portal = $db->fetchOne('SELECT * FROM portals WHERE id = ? AND user_id = ?', [$portalId, $user['user_id']]);
                if (!$portal) {
                    sendResponse(['error' => 'Portal not found or access denied'], 404);
                }
                
                $db->delete('portals', 'id = ?', [$portalId]);
                sendResponse(['message' => 'Portal deleted successfully']);
            }
            break;
            
        default:
            sendResponse(['error' => 'Method not allowed'], 405);
    }
    
} catch (Exception $e) {
    sendResponse(['error' => $e->getMessage()], 500);
}

// If no route matched
sendResponse(['error' => 'Endpoint not found'], 404);
?>