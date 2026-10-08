# prod-readiness-check.ps1
#
# READ-ONLY report before deploying the new Firestore rules.
# It never writes, updates or deletes anything. It uses only two Firestore REST calls:
#   - GET  .../documents/users              (list users, selected fields only)
#   - POST .../documents:runAggregationQuery (count documents - returns numbers only)
#
# Auth: your own gcloud login (gcloud auth print-access-token). No keys, no passwords.
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\prod-readiness-check.ps1 -Project agentsale-693e8
#   powershell -ExecutionPolicy Bypass -File scripts\prod-readiness-check.ps1 -Project magicsale-test
#
# Optional: list the sales documents that have no AgentId (reads every sales doc, AgentId +
# a few identifying fields only):
#   ... -Project agentsale-693e8 -ListSalesWithoutAgent

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("agentsale-693e8", "magicsale-test")]
  [string]$Project,

  [switch]$ListSalesWithoutAgent
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$token = (& gcloud auth print-access-token).Trim()
if (-not $token) { throw "No gcloud token. Run: gcloud auth login" }

$headers = @{ Authorization = "Bearer $token" }
$base = "https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/documents"

Write-Host ""
Write-Host "==============================================="
Write-Host " Project: $Project   (READ ONLY)"
Write-Host "==============================================="

function Get-Field($doc, [string]$name) {
  $f = $doc.fields.$name
  if ($null -eq $f) { return "" }
  if ($null -ne $f.stringValue) { return [string]$f.stringValue }
  if ($null -ne $f.booleanValue) { return [string]$f.booleanValue }
  if ($null -ne $f.integerValue) { return [string]$f.integerValue }
  return ""
}

function Get-Uid($doc) {
  return ($doc.name -split "/")[-1]
}

# ---------------------------------------------------------------
# 1. Users (only the fields needed for the access checks)
# ---------------------------------------------------------------
$fields = @("role", "isSystem", "agentId", "agentGroupId", "managerId", "agencies", "name")
$mask = ($fields | ForEach-Object { "mask.fieldPaths=$_" }) -join "&"

$users = @()
$pageToken = ""
do {
  $url = "$base/users?pageSize=300&$mask"
  if ($pageToken) { $url = "$url&pageToken=$([uri]::EscapeDataString($pageToken))" }
  $res = Invoke-RestMethod -Method Get -Uri $url -Headers $headers
  if ($res.documents) { $users += $res.documents }
  $pageToken = $res.nextPageToken
} while ($pageToken)

$byUid = @{}
foreach ($u in $users) { $byUid[(Get-Uid $u)] = $u }

function Describe($u) {
  return "{0}  name='{1}'  role='{2}'" -f (Get-Uid $u), (Get-Field $u "name"), (Get-Field $u "role")
}

Write-Host ""
Write-Host "Users: $($users.Count)"

# 1a. isSystem
$sys = @($users | Where-Object { (Get-Field $_ "isSystem") -eq "True" })
Write-Host ""
Write-Host "[1] isSystem = true: $($sys.Count)   (expected: only the owner)"
foreach ($u in $sys) { Write-Host "    $(Describe $u)" }

# 1b. role not recognized -> loses all access under the new rules
$known = @("agent", "manager", "worker", "admin")
$noRole = @($users | Where-Object { $known -notcontains (Get-Field $_ "role") })
Write-Host ""
Write-Host "[2] Users without a known role (agent/manager/worker/admin): $($noRole.Count)   (they lose access)"
foreach ($u in $noRole) { Write-Host "    $(Describe $u)" }

# 1c. worker whose agent is missing
$workers = @($users | Where-Object { (Get-Field $_ "role") -eq "worker" })
$badWorkers = @($workers | Where-Object {
    $a = Get-Field $_ "agentId"
    (-not $a) -or (-not $byUid.ContainsKey($a))
  })
Write-Host ""
Write-Host "[3] Workers whose agentId is empty or not a user: $($badWorkers.Count)   (they see no agent)"
foreach ($u in $badWorkers) { Write-Host "    $(Describe $u)  agentId='$(Get-Field $u "agentId")'" }

# 1d. agent linked to a manager (managerId) but in a different agentGroupId
$linked = @($users | Where-Object { Get-Field $_ "managerId" })
$mismatch = @()
foreach ($u in $linked) {
  $mid = Get-Field $u "managerId"
  $uGroup = Get-Field $u "agentGroupId"
  if (-not $byUid.ContainsKey($mid)) {
    $mismatch += "    $(Describe $u)  managerId='$mid' (manager not found)"
    continue
  }
  $mGroup = Get-Field $byUid[$mid] "agentGroupId"
  if ((-not $uGroup) -or ($uGroup -ne $mGroup)) {
    $mismatch += "    $(Describe $u)  group='$uGroup'  manager='$mid' managerGroup='$mGroup'"
  }
}
Write-Host ""
Write-Host "[4] Agents whose agentGroupId differs from their manager's: $($mismatch.Count)   (the manager will not see them)"
foreach ($line in $mismatch) { Write-Host $line }

# ---------------------------------------------------------------
# 2. Documents without an agent field (counts only)
# ---------------------------------------------------------------
function Get-Count([string]$collection, [string]$field) {
  $sq = @{ from = @(@{ collectionId = $collection }) }
  if ($field) {
    $sq.where = @{ unaryFilter = @{ op = "IS_NOT_NULL"; field = @{ fieldPath = $field } } }
  }
  $body = @{
    structuredAggregationQuery = @{
      structuredQuery = $sq
      aggregations    = @(@{ alias = "n"; count = @{} })
    }
  } | ConvertTo-Json -Depth 10
  $res = Invoke-RestMethod -Method Post -Uri "$($base):runAggregationQuery" -Headers $headers -Body $body -ContentType "application/json"
  return [int64](@($res)[0].result.aggregateFields.n.integerValue)
}

$checks = @(
  @("customer", "AgentId"), @("sales", "AgentId"), @("contracts", "AgentId"),
  @("customerDocuments", "AgentId"), @("leadDocuments", "AgentId"),
  @("customerNotes", "agentId"), @("customerTasks", "agentId"),
  @("policyCommissionSummaries", "agentId"), @("externalCommissions", "agentId"),
  @("commissionSummaries", "agentId"), @("ymCommissionSummaries", "agentId"),
  @("commissionImportRuns", "agentId"), @("commissionImportQueue", "agentId"),
  @("importRuns", "agentId"), @("commissionSplits", "agentId"), @("commissionLinks", "agentId"),
  @("agentPortalFilters", "agentId"), @("tierCalcRuns", "agentId"), @("agentInsightsCache", "agentId"),
  @("whatsapp_conversations", "agentId")
)

Write-Host ""
Write-Host "[5] Documents without the agent field (visible only to isSystem after the rules):"
Write-Host ("    {0,-28} {1,-9} {2,10} {3,12}" -f "collection", "field", "missing", "total")
foreach ($c in $checks) {
  try {
    $total = Get-Count $c[0] ""
    $withField = Get-Count $c[0] $c[1]
    $missing = $total - $withField
    $flag = ""
    if ($missing -gt 0) { $flag = "  <--" }
    Write-Host ("    {0,-28} {1,-9} {2,10} {3,12}{4}" -f $c[0], $c[1], $missing, $total, $flag)
  } catch {
    Write-Host ("    {0,-28} ERROR: {1}" -f $c[0], $_.Exception.Message)
  }
}

# ---------------------------------------------------------------
# 3. Optional: which sales documents have no AgentId
# ---------------------------------------------------------------
if ($ListSalesWithoutAgent) {
  $salesFields = @("AgentId", "firstNameCustomer", "lastNameCustomer", "IDCustomer", "company", "product", "mounth")
  $salesMask = ($salesFields | ForEach-Object { "mask.fieldPaths=$_" }) -join "&"
  $found = @()
  $scanned = 0
  $pageToken = ""
  do {
    $url = "$base/sales?pageSize=300&$salesMask"
    if ($pageToken) { $url = "$url&pageToken=$([uri]::EscapeDataString($pageToken))" }
    $res = Invoke-RestMethod -Method Get -Uri $url -Headers $headers
    foreach ($d in @($res.documents)) {
      if ($null -eq $d) { continue }
      $scanned++
      if (-not (Get-Field $d "AgentId")) { $found += $d }
    }
    $pageToken = $res.nextPageToken
  } while ($pageToken)

  Write-Host ""
  Write-Host "[6] sales without AgentId: $($found.Count) (scanned $scanned)"
  foreach ($d in $found) {
    Write-Host ("    id={0}  customer='{1} {2}'  IDCustomer='{3}'  company='{4}'  product='{5}'  month='{6}'" -f `
      (Get-Uid $d), (Get-Field $d "firstNameCustomer"), (Get-Field $d "lastNameCustomer"),
      (Get-Field $d "IDCustomer"), (Get-Field $d "company"), (Get-Field $d "product"), (Get-Field $d "mounth"))
  }
}

Write-Host ""
Write-Host "Done. Nothing was changed."
