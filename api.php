<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// ==========================================
// DATABASE CONFIGURATION (EDIT THIS FOR HOST)
// ==========================================
$db_host = "localhost";
$db_user = "your_db_username";
$db_pass = "your_db_password";
$db_name = "your_db_name";

try {
    $conn = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Initialize database table if not exists
    $conn->exec("CREATE TABLE IF NOT EXISTS daily_reports (
        report_date VARCHAR(10) PRIMARY KEY,
        report_data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;");
    
} catch (PDOException $e) {
    echo json_encode(["success" => false, "message" => "Database connection failed: " . $e->getMessage()]);
    exit();
}

// Simple Router
$request_uri = $_SERVER['REQUEST_URI'];
$api_path = parse_url($request_uri, PHP_URL_PATH);

// Helper to get raw JSON inputs
function getJsonInput() {
    return json_decode(file_get_contents("php://input"), true);
}

// 1. POST Login: /api/login or api.php?action=login
$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action === 'login' || strpos($api_path, '/api/login') !== false) {
    $input = getJsonInput();
    $password = isset($input['password']) ? $input['password'] : '';
    
    if ($password === '1234') {
        echo json_encode(["success" => true, "role" => "staff", "token" => "staff-session-token"]);
    } else if ($password === '6282') {
        echo json_encode(["success" => true, "role" => "admin", "token" => "admin-session-token"]);
    } else {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Invalid PIN."]);
    }
    exit();
}

// 2. POST Save Report: /api/reports or api.php?action=save_report
if ($action === 'save_report' || ($_SERVER['REQUEST_METHOD'] === 'POST' && strpos($api_path, '/api/reports') !== false)) {
    $input = getJsonInput();
    $date = isset($input['date']) ? $input['date'] : '';
    $data = isset($input['data']) ? $input['data'] : null;
    
    if (!$date || !$data) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Missing date or data."]);
        exit();
    }
    
    try {
        $data_json = json_encode($data);
        $stmt = $conn->prepare("INSERT INTO daily_reports (report_date, report_data) 
                                VALUES (:rdate, :rdata) 
                                ON DUPLICATE KEY UPDATE report_data = :rdata");
        $stmt->execute([':rdate' => $date, ':rdata' => $data_json]);
        echo json_encode(["success" => true, "message" => "Report saved successfully!", "date" => $date]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "SQL Error: " . $e->getMessage()]);
    }
    exit();
}

// 3. GET Reports List: /api/reports or api.php?action=get_reports
if ($action === 'get_reports' || ($_SERVER['REQUEST_METHOD'] === 'GET' && strpos($api_path, '/api/reports') !== false && strpos($api_path, '/details') === false)) {
    try {
        $stmt = $conn->query("SELECT report_data FROM daily_reports ORDER BY report_date DESC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $summaries = [];
        foreach ($rows as $row) {
            $r = json_decode($row['report_data'], true);
            if ($r) {
                $summaries[] = [
                    "date" => isset($r['date']) ? $r['date'] : '',
                    "totalSales" => isset($r['sales']['total']) ? $r['sales']['total'] : 0,
                    "totalExpenses" => isset($r['expensesTotal']['total']) ? $r['expensesTotal']['total'] : 0,
                    "netProfit" => (isset($r['sales']['total']) ? $r['sales']['total'] : 0) - (isset($r['expensesTotal']['total']) ? $r['expensesTotal']['total'] : 0),
                    "closingCash" => isset($r['closingBalances']['cash']) ? $r['closingBalances']['cash'] : 0,
                    "excessShort" => isset($r['excessShort']['cash']) ? $r['excessShort']['cash'] : 0,
                    "createdBy" => isset($r['createdBy']) ? $r['createdBy'] : 'Staff'
                ];
            }
        }
        echo json_encode($summaries);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "SQL Error: " . $e->getMessage()]);
    }
    exit();
}

// 4. GET Report Details: /api/reports/details/:date or api.php?action=get_details&date=YYYY-MM-DD
if ($action === 'get_details' || ($_SERVER['REQUEST_METHOD'] === 'GET' && strpos($api_path, '/api/reports/details/') !== false)) {
    $date = '';
    if (isset($_GET['date'])) {
        $date = $_GET['date'];
    } else {
        // Extract date from URI path /api/reports/details/YYYY-MM-DD
        $parts = explode('/', $api_path);
        $date = end($parts);
    }
    
    try {
        $stmt = $conn->prepare("SELECT report_data FROM daily_reports WHERE report_date = :rdate");
        $stmt->execute([':rdate' => $date]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "Report not found."]);
            exit();
        }
        
        echo $row['report_data'];
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "SQL Error: " . $e->getMessage()]);
    }
    exit();
}

// 5. GET Carry-forward: /api/carry-forward or api.php?action=carry_forward
if ($action === 'carry_forward' || ($_SERVER['REQUEST_METHOD'] === 'GET' && strpos($api_path, '/api/carry-forward') !== false)) {
    $date = isset($_GET['date']) ? $_GET['date'] : '';
    if (!$date) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Missing date parameter."]);
        exit();
    }

    try {
        $stmt = $conn->prepare("SELECT report_data FROM daily_reports WHERE report_date < :rdate ORDER BY report_date DESC LIMIT 1");
        $stmt->execute([':rdate' => $date]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            echo json_encode([
                "openingBalances" => ["cash" => 0, "franchisee" => 0, "mgmt" => 0],
                "meatStock" => [
                    "chicken" => ["opening" => 0],
                    "beef" => ["opening" => 0]
                ],
                "staffLedger" => []
            ]);
            exit();
        }

        $previous = json_decode($row['report_data'], true);
        $staffLedger = [];
        if (isset($previous['staffLedger'])) {
            foreach ($previous['staffLedger'] as $s) {
                $balance = isset($s['balance']) ? $s['balance'] : 0;
                $staffLedger[] = [
                    "name" => isset($s['name']) ? $s['name'] : '',
                    "designation" => isset($s['designation']) ? $s['designation'] : '',
                    "ob" => $balance,
                    "wagePayable" => 0,
                    "wagePaid" => 0,
                    "balance" => $balance
                ];
            }
        }

        echo json_encode([
            "openingBalances" => [
                "cash" => isset($previous['closingBalances']['cash']) ? $previous['closingBalances']['cash'] : 0,
                "franchisee" => isset($previous['closingBalances']['franchisee']) ? $previous['closingBalances']['franchisee'] : 0,
                "mgmt" => isset($previous['closingBalances']['mgmt']) ? $previous['closingBalances']['mgmt'] : 0
            ],
            "meatStock" => [
                "chicken" => ["opening" => isset($previous['meatStock']['chicken']['balance']) ? $previous['meatStock']['chicken']['balance'] : 0],
                "beef" => ["opening" => isset($previous['meatStock']['beef']['balance']) ? $previous['meatStock']['beef']['balance'] : 0]
            ],
            "staffLedger" => $staffLedger
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "SQL Error: " . $e->getMessage()]);
    }
    exit();
}

// 6. GET Dashboard Summary: /api/dashboard-summary or api.php?action=dashboard_summary
if ($action === 'dashboard_summary' || ($_SERVER['REQUEST_METHOD'] === 'GET' && strpos($api_path, '/api/dashboard-summary') !== false)) {
    $startDate = isset($_GET['startDate']) ? $_GET['startDate'] : '';
    $endDate = isset($_GET['endDate']) ? $_GET['endDate'] : '';
    
    try {
        $stmt = $conn->query("SELECT report_data FROM daily_reports ORDER BY report_date ASC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $reports = [];
        foreach ($rows as $row) {
            $r = json_decode($row['report_data'], true);
            if ($r) {
                // Filter by date range if provided
                if ($startDate && $r['date'] < $startDate) continue;
                if ($endDate && $r['date'] > $endDate) continue;
                $reports[] = $r;
            }
        }
        
        $totalSales = 0;
        $totalExpenses = 0;
        $totalWages = 0;
        $totalPurchases = 0;
        
        $salesSplit = ["cash"=>0, "card"=>0, "upi"=>0, "zomato"=>0, "swiggy"=>0, "credit"=>0];
        $expenseBreakdown = [];
        $trendData = [];
        
        foreach ($reports as $r) {
            $sales = isset($r['sales']['total']) ? $r['sales']['total'] : 0;
            $expenses = isset($r['expensesTotal']['total']) ? $r['expensesTotal']['total'] : 0;
            
            $totalSales += $sales;
            $totalExpenses += $expenses;
            
            // Splits
            $salesSplit['cash'] += isset($r['sales']['cash']) ? $r['sales']['cash'] : 0;
            $salesSplit['card'] += isset($r['sales']['card']) ? $r['sales']['card'] : 0;
            $salesSplit['upi'] += isset($r['sales']['upi']) ? $r['sales']['upi'] : 0;
            $salesSplit['zomato'] += isset($r['sales']['zomato']) ? $r['sales']['zomato'] : 0;
            $salesSplit['swiggy'] += isset($r['sales']['swiggy']) ? $r['sales']['swiggy'] : 0;
            $salesSplit['credit'] += isset($r['sales']['credit']) ? $r['sales']['credit'] : 0;
            
            // Categories
            if (isset($r['expenses'])) {
                foreach ($r['expenses'] as $e) {
                    $cat = isset($e['category']) ? $e['category'] : 'Other';
                    $cost = isset($e['total']) ? $e['total'] : ((isset($e['cash'])?$e['cash']:0) + (isset($e['bank'])?$e['bank']:0));
                    if (!isset($expenseBreakdown[$cat])) $expenseBreakdown[$cat] = 0;
                    $expenseBreakdown[$cat] += $cost;
                }
            }
            if (isset($r['purchases'])) {
                foreach ($r['purchases'] as $p) {
                    $item = isset($p['item']) ? $p['item'] : 'Grocery Purchases';
                    $cost = isset($p['total']) ? $p['total'] : ((isset($p['cash'])?$p['cash']:0) + (isset($p['bank'])?$p['bank']:0));
                    if (!isset($expenseBreakdown[$item])) $expenseBreakdown[$item] = 0;
                    $expenseBreakdown[$item] += $cost;
                    $totalPurchases += $cost;
                }
            }
            if (isset($r['wages'])) {
                foreach ($r['wages'] as $w) {
                    $cost = (isset($w['cash'])?$w['cash']:0) + (isset($w['bank'])?$w['bank']:0);
                    if (!isset($expenseBreakdown['Wages'])) $expenseBreakdown['Wages'] = 0;
                    $expenseBreakdown['Wages'] += $cost;
                    $totalWages += $cost;
                }
            }
            
            $trendData[] = [
                "date" => $r['date'],
                "sales" => $sales,
                "expenses" => $expenses,
                "profit" => $sales - $expenses
            ];
        }
        
        $numDays = count($reports) ?: 1;
        
        echo json_encode([
            "summary" => [
                "totalSales" => $totalSales,
                "totalExpenses" => $totalExpenses,
                "netProfit" => $totalSales - $totalExpenses,
                "avgDailySales" => round($totalSales / $numDays),
                "totalWages" => $totalWages,
                "totalPurchases" => $totalPurchases
            ],
            "salesSplit" => $salesSplit,
            "expenseBreakdown" => $expenseBreakdown,
            "trendData" => $trendData
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "SQL Error: " . $e->getMessage()]);
    }
    exit();
}

// Default response if route doesn't match
http_response_code(404);
echo json_encode(["success" => false, "message" => "API Route not found."]);
?>
