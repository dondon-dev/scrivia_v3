package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
	_ "modernc.org/sqlite"
)

func main() {
	app := pocketbase.New()

	// ── Custom API routes (replacing Supabase RPCs) ──────────────────────────
	app.OnServe().Add(func(e *core.ServeEvent) error {
		// Auth routes
		e.Router.POST("/api/auth/signup", handleSignup(app))
		e.Router.POST("/api/auth/mfa/issue", handleMfaIssue(app))
		e.Router.POST("/api/auth/mfa/verify", handleMfaVerify(app))
		e.Router.POST("/api/auth/mfa/resend", handleMfaResend(app))
		e.Router.POST("/api/auth/approve", requireRole(app, "super_admin"), handleApproveUser(app))
		e.Router.POST("/api/auth/reject", requireRole(app, "super_admin"), handleRejectUser(app))
		e.Router.POST("/api/auth/disable", requireRole(app, "super_admin"), handleDisableUser(app))
		e.Router.POST("/api/auth/enable", requireRole(app, "super_admin"), handleEnableUser(app))

		// Role permissions
		e.Router.GET("/api/permissions", requireAuth(app), handleGetPermissions(app))
		e.Router.POST("/api/permissions/upsert", requireRole(app, "super_admin"), handleUpsertPermission(app))
		e.Router.POST("/api/permissions/delete", requireRole(app, "super_admin"), handleDeletePermission(app))

		// Organization
		e.Router.GET("/api/regions", requireAuth(app), handleGetRegions(app))
		e.Router.POST("/api/regions", requireRole(app, "super_admin"), handleCreateRegion(app))
		e.Router.PUT("/api/regions/:id", requireRole(app, "super_admin"), handleUpdateRegion(app))
		e.Router.DELETE("/api/regions/:id", requireRole(app, "super_admin"), handleDeleteRegion(app))
		e.Router.GET("/api/divisions", requireAuth(app), handleGetDivisions(app))
		e.Router.POST("/api/divisions", requireRole(app, "super_admin"), handleCreateDivision(app))
		e.Router.PUT("/api/divisions/:id", requireRole(app, "super_admin"), handleUpdateDivision(app))
		e.Router.DELETE("/api/divisions/:id", requireRole(app, "super_admin"), handleDeleteDivision(app))
		e.Router.POST("/api/divisions/:id/assign-schools", requireRole(app, "super_admin"), handleAssignSchools(app))
		e.Router.POST("/api/divisions/:id/clear-schools", requireRole(app, "super_admin"), handleClearSchools(app))

		// Dashboard
		e.Router.GET("/api/dashboard/summary", requireAuth(app), handleDashboardSummary(app))
		e.Router.POST("/api/dashboard/refresh-cache", requireRole(app, "super_admin"), handleRefreshDashboardCache(app))

		// Payroll
		e.Router.POST("/api/payroll/run", requireRole(app, "super_admin", "payroll_admin", "payroll_processor"), handleRunPayroll(app))
		e.Router.POST("/api/payroll/reverse", requireRole(app, "super_admin", "payroll_admin"), handleReversePayroll(app))
		e.Router.GET("/api/payroll/engine-stats", requireAuth(app), handlePayrollEngineStats(app))
		e.Router.POST("/api/payroll/generate-periods", requireRole(app, "super_admin", "payroll_admin"), handleGenerateMonthlyPeriods(app))
		e.Router.GET("/api/payroll/deduction-engine", requireAuth(app), handleDeductionEngineStats(app))

		// Employees — hardcoded `employees` PocketBase table.
		// Both GET (query params) and POST (JSON body from supabase.rpc) are
		// served so Employee Records can never be lost to a method mismatch.
		e.Router.GET("/api/employees/query", requireAuth(app), handleQueryEmployees(app))
		e.Router.POST("/api/employees/query", requireAuth(app), handleQueryEmployees(app))
		e.Router.POST("/api/employees/set-number", requireRole(app, "super_admin", "payroll_admin"), handleSetEmployeeNumber(app))

		// DBF Import/Export
		e.Router.GET("/api/dbf/table-counts", requireAuth(app), handleDbfTableCounts(app))
		e.Router.POST("/api/dbf/table-counts", requireAuth(app), handleDbfTableCounts(app))
		e.Router.POST("/api/dbf/query-dedfile", requireAuth(app), handleQueryDedfile(app))
		e.Router.POST("/api/dbf/restore", requireRole(app, "super_admin", "payroll_admin"), handleDbfRestore(app))

		// Lockdown
		e.Router.POST("/api/lockdown/activate", requireRole(app, "super_admin"), handleLockdownActivate(app))
		e.Router.POST("/api/lockdown/deactivate", requireRole(app, "super_admin"), handleLockdownDeactivate(app))

		// Audit
		e.Router.GET("/api/audit/logs", requireAuth(app), handleGetAuditLogs(app))

		// Schools
		e.Router.GET("/api/schools/stats", requireAuth(app), handleSchoolStats(app))
		e.Router.POST("/api/query-schools-with-stats", requireAuth(app), handleQuerySchoolsWithStats(app))

		// Import logs
		e.Router.GET("/api/import-logs", requireAuth(app), handleGetImportLogs(app))

		return nil
	})

	// ── PocketBase built-in auth adapter ─────────────────────────────────────
	// We use PocketBase's built-in _superusers collection for admin auth,
	// and a custom "profiles" collection for user profiles with RBAC.

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// ── Middleware helpers ──────────────────────────────────────────────────────

func getRequestUser(e *core.RequestEvent) (*core.Record, error) {
	token, _ := e.Request.Header.Get("Authorization")
	token = strings.TrimPrefix(token, "Bearer ")
	if token == "" {
		return nil, fmt.Errorf("no token")
	}
	// PocketBase token validation
粑粑, err := e.App.Dao().FindByToken(token, e.App.Dao().RecordAuthRule("_superusers"))
	if err != nil {
		// Try normal record auth
		for _, collection := range e.App.Dao().Records().CollectionCache().Cache {
			if !collection.IsAuthProvider("email") {
				continue
			}
			粑粑, err = e.App.Dao().FindByToken(token, e.App.Dao().RecordAuthRule(collection.NameOrId()))
			if err == nil {
				return 粑粑, nil
			}
		}
		return nil, fmt.Errorf("invalid token")
	}
	return 粑粑, nil
}

func getAuthRecord(e *core.RequestEvent) (*core.Record, bool) {
	token, _ := e.Request.Header.Get("Authorization")
	token = strings.TrimPrefix(token, "Bearer ")
	if token == "" {
		return nil, false
	}
	// Try all auth collections
	collections := e.App.Dao().Records().CollectionCache().Cache
	for _, col := range collections {
		if !col.IsAuthProvider("email") && !col.IsAuthProvider("phone") {
			continue
		}
		record, err := e.App.Dao().FindByToken(token, e.App.Dao().RecordAuthRule(col.NameOrId()))
		if err == nil {
			return record, true
		}
	}
	return nil, false
}

func requireAuth(app *pocketbase.PocketBase) func(next http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(e *core.RequestEvent) error {
			if _, ok := getAuthRecord(e); !ok {
				return e.JSON(http.StatusUnauthorized, map[string]string{"error": "Authentication required"})
			}
			return next(e)
		}
	}
}

func requireRole(app *pocketbase.PocketBase, roles ...string) func(next http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(e *core.RequestEvent) error {
			record, ok := getAuthRecord(e)
			if !ok {
				return e.JSON(http.StatusUnauthorized, map[string]string{"error": "Authentication required"})
			}
			profile, err := app.Dao().FindFirstRecordByData("profiles", "id = ?", record.Id)
			if err != nil {
				return e.JSON(http.StatusForbidden, map[string]string{"error": "Profile not found"})
			}
			userRole := strings.ToLower(strings.TrimSpace(profile.GetString("role")))
			userStatus := profile.GetString("status")
			if userStatus != "approved" {
				return e.JSON(http.StatusForbidden, map[string]string{"error": "Account not approved"})
			}
			for _, r := range roles {
				if userRole == r {
					return next(e)
				}
			}
			return e.JSON(http.StatusForbidden, map[string]string{"error": "Insufficient permissions"})
		}
	}
}

// ── Auth Handlers ──────────────────────────────────────────────────────────

type SignUpRequest struct {
	FirstName           string `json:"firstName"`
	LastName            string `json:"lastName"`
	Email               string `json:"email"`
	MobileNumber        string `json:"mobileNumber"`
	Username            string `json:"username"`
	OfficeAssignment    string `json:"officeAssignment"`
	PositionDesignation string `json:"positionDesignation"`
	EmployeeNumber      string `json:"employeeNumber"`
	Password            string `json:"password"`
}

func handleSignup(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req SignUpRequest
		if err := e.BindBody(&req); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		if req.Email == "" || req.Password == "" || req.FirstName == "" || req.LastName == "" {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Missing required fields"})
		}

		// Check if user already exists
		existing, _ := app.Dao().FindFirstRecordByData("profiles", "email = ?", strings.ToLower(req.Email))
		if existing != nil {
			return e.JSON(http.StatusConflict, map[string]string{"error": "An account with this email already exists"})
		}

		// Create PocketBase auth record in the "profiles" collection (must be an auth collection)
		collection, err := app.Dao().FindCollectionByNameOrId("profiles")
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Profiles collection not found"})
		}

		record := core.NewRecord(collection)
		record.Set("email", strings.ToLower(req.Email))
		record.Set("first_name", req.FirstName)
		record.Set("last_name", req.LastName)
		record.Set("mobile_number", req.MobileNumber)
		record.Set("username", req.Username)
		record.Set("office_assignment", req.OfficeAssignment)
		record.Set("position_designation", req.PositionDesignation)
		record.Set("employee_number", req.EmployeeNumber)
		record.Set("role", "read_only")
		record.Set("status", "pending_approval")
		record.Set("email_verified", false)
		record.Set("mfa_enabled", false)
		record.Set("failed_login_attempts", 0)

		if err := app.Dao().SaveRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create account: " + err.Error()})
		}

		// Create PocketBase auth account
		_, err = app.Dao().CreateAuthRecord(collection, record, req.Password)
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create auth: " + err.Error()})
		}

		// Log signup
		logAudit(app, record.Id, req.Email, "signup", "profiles", record.Id, nil)

		return e.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Registration successful. Your account is pending administrator approval.",
		})
	}
}

func handleApproveUser(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			TargetUserId string `json:"targetUserId"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "Not authenticated"})
		}

		target, err := app.Dao().FindRecordById("profiles", body.TargetUserId)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "User not found"})
		}

		target.Set("status", "approved")
		target.Set("approved_by", callerRecord.Id)
		target.Set("approved_at", time.Now().UTC().Format(time.RFC3339))
		target.Set("rejection_reason", nil)
		target.Set("rejected_by", nil)
		target.Set("rejected_at", nil)

		if err := app.Dao().SaveRecord(target); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to approve user"})
		}

		logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "user_approved", "profiles", body.TargetUserId, map[string]interface{}{
			"approved_email": target.GetString("email"),
		})

		return e.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"email":   target.GetString("email"),
		})
	}
}

func handleRejectUser(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			TargetUserId    string `json:"targetUserId"`
			RejectionReason string `json:"rejectionReason"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "Not authenticated"})
		}

		target, err := app.Dao().FindRecordById("profiles", body.TargetUserId)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "User not found"})
		}

		target.Set("status", "rejected")
		target.Set("rejected_by", callerRecord.Id)
		target.Set("rejected_at", time.Now().UTC().Format(time.RFC3339))
		target.Set("rejection_reason", body.RejectionReason)

		if err := app.Dao().SaveRecord(target); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to reject user"})
		}

		logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "user_rejected", "profiles", body.TargetUserId, map[string]interface{}{
			"rejected_email": target.GetString("email"),
			"reason":         body.RejectionReason,
		})

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleDisableUser(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			TargetUserId string `json:"targetUserId"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "Not authenticated"})
		}

		target, err := app.Dao().FindRecordById("profiles", body.TargetUserId)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "User not found"})
		}

		target.Set("status", "disabled")
		target.Set("disabled_by", callerRecord.Id)
		target.Set("disabled_at", time.Now().UTC().Format(time.RFC3339))

		if err := app.Dao().SaveRecord(target); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to disable user"})
		}

		logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "user_disabled", "profiles", body.TargetUserId, map[string]interface{}{
			"disabled_email": target.GetString("email"),
		})

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleEnableUser(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			TargetUserId string `json:"targetUserId"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord == nil {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "Not authenticated"})
		}

		target, err := app.Dao().FindRecordById("profiles", body.TargetUserId)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "User not found"})
		}

		target.Set("status", "approved")
		target.Set("disabled_by", nil)
		target.Set("disabled_at", nil)

		if err := app.Dao().SaveRecord(target); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to enable user"})
		}

		logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "user_enabled", "profiles", body.TargetUserId, map[string]interface{}{
			"enabled_email": target.GetString("email"),
		})

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

// ── MFA Handlers ───────────────────────────────────────────────────────────

func handleMfaIssue(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			Email string `json:"email"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		code := generateOTP()
		codeHash := security.Hash(code + body.Email)
		expiresAt := time.Now().UTC().Add(5 * time.Minute)

		// Store OTP in database
		collection, err := app.Dao().FindCollectionByNameOrId("otp_codes")
		if err != nil {
			// If otp_codes collection doesn't exist, skip MFA
			return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
		}

		record := core.NewRecord(collection)
		record.Set("email", strings.ToLower(body.Email))
		record.Set("code_hash", codeHash)
		record.Set("expires_at", expiresAt.Format(time.RFC3339))
		record.Set("used", false)

		if err := app.Dao().SaveRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to issue OTP"})
		}

		// TODO: Send email with OTP code (use SMTP or email service)
		log.Printf("[MFA] OTP for %s: %s", body.Email, code)

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleMfaVerify(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			Email string `json:"email"`
			Code  string `json:"code"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		codeHash := security.Hash(body.Code + body.Email)

		// Find valid OTP
		records, err := app.Dao().FindRecordsByFilter(
			"otp_codes",
			"email = {:email} AND code_hash = {:hash} AND used = false AND expires_at > {:now}",
			map[string]any{
				"email": strings.ToLower(body.Email),
				"hash":  codeHash,
				"now":   time.Now().UTC().Format(time.RFC3339),
			},
		)
		if err != nil || len(records) == 0 {
			return e.JSON(http.StatusOK, map[string]interface{}{
				"ok":     false,
				"reason": "invalid_code",
			})
		}

		// Mark OTP as used
		records[0].Set("used", true)
		app.Dao().SaveRecord(records[0])

		return e.JSON(http.StatusOK, map[string]interface{}{
			"ok":      true,
			"remaining": 0,
		})
	}
}

func handleMfaResend(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			Email string `json:"email"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		// Invalidate old OTPs
		app.Dao().DB().NewQuery("UPDATE otp_codes SET used = true WHERE email = {:email} AND used = false").Bind(dbx.Params{
			"email": strings.ToLower(body.Email),
		}).Execute()

		// Issue new
		code := generateOTP()
		codeHash := security.Hash(code + body.Email)

		collection, _ := app.Dao().FindCollectionByNameOrId("otp_codes")
		if collection != nil {
			record := core.NewRecord(collection)
			record.Set("email", strings.ToLower(body.Email))
			record.Set("code_hash", codeHash)
			record.Set("expires_at", time.Now().UTC().Add(5*time.Minute).Format(time.RFC3339))
			record.Set("used", false)
			app.Dao().SaveRecord(record)
		}

		log.Printf("[MFA] Resent OTP for %s: %s", body.Email, code)
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

// ── Permission Handlers ────────────────────────────────────────────────────

func handleGetPermissions(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		records, err := app.Dao().FindRecordsByFilter("role_permissions", "1 = 1")
		if err != nil {
			return e.JSON(http.StatusOK, []interface{}{})
		}
		result := make([]map[string]interface{}, 0, len(records))
		for _, r := range records {
			result = append(result, map[string]interface{}{
				"role":       r.GetString("role"),
				"permission": r.GetString("permission"),
				"granted":    r.GetBool("granted"),
			})
		}
		return e.JSON(http.StatusOK, result)
	}
}

func handleUpsertPermission(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			Role       string `json:"p_role"`
			Permission string `json:"p_permission"`
			Granted    bool   `json:"p_granted"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		// Find existing
		existing, _ := app.Dao().FindFirstRecordByData("role_permissions", "role = ? AND permission = ?", body.Role, body.Permission)

		if existing != nil {
			existing.Set("granted", body.Granted)
			app.Dao().SaveRecord(existing)
		} else {
			collection, err := app.Dao().FindCollectionByNameOrId("role_permissions")
			if err != nil {
				return e.JSON(http.StatusInternalServerError, map[string]string{"error": "role_permissions collection not found"})
			}
			record := core.NewRecord(collection)
			record.Set("role", body.Role)
			record.Set("permission", body.Permission)
			record.Set("granted", body.Granted)
			app.Dao().SaveRecord(record)
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord != nil {
			logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "role_permission_change", "role_permissions",
				body.Role+":"+body.Permission, map[string]interface{}{
					"role":       body.Role,
					"permission": body.Permission,
					"granted":    body.Granted,
				})
		}

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleDeletePermission(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			Role       string `json:"p_role"`
			Permission string `json:"p_permission"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		existing, _ := app.Dao().FindFirstRecordByData("role_permissions", "role = ? AND permission = ?", body.Role, body.Permission)
		if existing != nil {
			app.Dao().DeleteRecord(existing)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

// ── Organization Handlers ──────────────────────────────────────────────────

func handleGetRegions(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		records, err := app.Dao().FindRecordsByFilter("regions", "1 = 1", "-sort_order")
		if err != nil {
			return e.JSON(http.StatusOK, []interface{}{})
		}
		result := make([]map[string]interface{}, 0)
		for _, r := range records {
			result = append(result, recordToMap(r))
		}
		return e.JSON(http.StatusOK, result)
	}
}

func handleCreateRegion(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body map[string]interface{}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		collection, err := app.Dao().FindCollectionByNameOrId("regions")
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Collection not found"})
		}

		record := core.NewRecord(collection)
		for k, v := range body {
			record.Set(k, v)
		}
		if err := app.Dao().SaveRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord != nil {
			logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "region_create", "regions", record.Id, body)
		}

		return e.JSON(http.StatusOK, recordToMap(record))
	}
}

func handleUpdateRegion(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		var body map[string]interface{}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		record, err := app.Dao().FindRecordById("regions", id)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "Region not found"})
		}
		for k, v := range body {
			record.Set(k, v)
		}
		if err := app.Dao().SaveRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, recordToMap(record))
	}
}

func handleDeleteRegion(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")

		// Check for divisions
		divs, _ := app.Dao().FindRecordsByFilter("divisions", "region_id = {:id}", dbx.Params{"id": id})
		if len(divs) > 0 {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("Region has %d division(s). Remove them first.", len(divs))})
		}

		record, err := app.Dao().FindRecordById("regions", id)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "Region not found"})
		}
		if err := app.Dao().DeleteRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleGetDivisions(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		records, err := app.Dao().FindRecordsByFilter("divisions", "1 = 1", "-division_name")
		if err != nil {
			return e.JSON(http.StatusOK, []interface{}{})
		}
		result := make([]map[string]interface{}, 0)
		for _, r := range records {
			result = append(result, recordToMap(r))
		}
		return e.JSON(http.StatusOK, result)
	}
}

func handleCreateDivision(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body map[string]interface{}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		collection, err := app.Dao().FindCollectionByNameOrId("divisions")
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "Collection not found"})
		}
		record := core.NewRecord(collection)
		for k, v := range body {
			record.Set(k, v)
		}
		if err := app.Dao().SaveRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, recordToMap(record))
	}
}

func handleUpdateDivision(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		var body map[string]interface{}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		record, err := app.Dao().FindRecordById("divisions", id)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "Division not found"})
		}
		for k, v := range body {
			record.Set(k, v)
		}
		if err := app.Dao().SaveRecord(record); err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return e.JSON(http.StatusOK, recordToMap(record))
	}
}

func handleDeleteDivision(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		empCount, _ := app.Dao().RecordsQueryCount("employees", "division_id = {:id}", dbx.Params{"id": id})
		schoolCount, _ := app.Dao().RecordsQueryCount("schools", "division_id = {:id}", dbx.Params{"id": id})
		userCount, _ := app.Dao().RecordsQueryCount("profiles", "division_id = {:id}", dbx.Params{"id": id})
		if empCount+schoolCount+userCount > 0 {
			return e.JSON(http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("Division still has data assigned (%d employees, %d schools, %d users).", empCount, schoolCount, userCount),
			})
		}
		record, err := app.Dao().FindRecordById("divisions", id)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "Division not found"})
		}
		app.Dao().DeleteRecord(record)
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleAssignSchools(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		var body struct {
			SchoolIds []string `json:"schoolIds"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		assigned := 0
		for _, sid := range body.SchoolIds {
			school, err := app.Dao().FindRecordById("schools", sid)
			if err == nil {
				school.Set("division_id", id)
				app.Dao().SaveRecord(school)
				assigned++
			}
		}
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "assigned": assigned})
	}
}

func handleClearSchools(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		var body struct {
			SchoolIds []string `json:"schoolIds"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		cleared := 0
		for _, sid := range body.SchoolIds {
			school, err := app.Dao().FindRecordById("schools", sid)
			if err == nil && school.GetString("division_id") == id {
				school.Set("division_id", nil)
				app.Dao().SaveRecord(school)
				cleared++
			}
		}
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "cleared": cleared})
	}
}

// ── Dashboard Handler ──────────────────────────────────────────────────────

func handleDashboardSummary(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		category := e.Request.URL.Query().Get("category")
		regcode := e.Request.URL.Query().Get("regcode")
		divcodesStr := e.Request.URL.Query().Get("divcodes")

		var divcodes []string
		if divcodesStr != "" {
			divcodes = strings.Split(divcodesStr, ",")
		}

		db := app.Dao().DB()

		// Scoped employee query
		empQuery := "SELECT * FROM employees WHERE status = 'Active'"
		params := map[string]any{}

		if category == "elementary" {
			empQuery += " AND CAST(stacode AS INTEGER) BETWEEN 1 AND 499"
		} else if category == "highschool" {
			empQuery += " AND CAST(stacode AS INTEGER) BETWEEN 500 AND 701"
		}

		if regcode != "" {
			empQuery += " AND regcode = {:regcode}"
			params["regcode"] = regcode
		}
		if len(divcodes) > 0 {
			placeholders := make([]string, len(divcodes))
			for i, dc := range divcodes {
				key := fmt.Sprintf("divcode_%d", i)
				placeholders[i] = "{:" + key + "}"
				params[key] = dc
			}
			empQuery += " AND divcode IN (" + strings.Join(placeholders, ",") + ")"
		}

		// Get active employee count
		var totalRecords, activeEmployees int
		db.NewQuery("SELECT COUNT(*) FROM employees").Row(&totalRecords)
		db.NewQuery("SELECT COUNT(*) FROM employees WHERE status = 'Active'").Row(&activeEmployees)

		// Get payroll aggregates
		var totalGross, totalNet, totalMandatory, totalLoanDeds float64
		var processedCount, pendingCount int
		db.NewQuery("SELECT COALESCE(SUM(gross_pay),0), COALESCE(SUM(net_pay),0), COALESCE(SUM(dedlnr+dedmed+dedpag+dedtax),0), COALESCE(SUM(other_deductions),0), COUNT(CASE WHEN status='Posted' THEN 1 END), COUNT(CASE WHEN status='Computed' THEN 1 END) FROM payroll_entries").Row(
			&totalGross, &totalNet, &totalMandatory, &totalLoanDeds, &processedCount, &pendingCount,
		)

		// Get current period
		var currentPeriod interface{} = nil
		var periodName sql.NullString
		db.NewQuery("SELECT period_name FROM pay_periods WHERE status != 'closed' ORDER BY start_date DESC LIMIT 1").Row(&periodName)
		if periodName.Valid {
			currentPeriod = periodName.String
		}

		// Get group stats
		groups, _ := app.Dao().FindRecordsByFilter("payroll_groups", "status = 'Active'", "stacode_min")

		// Build response
		return e.JSON(http.StatusOK, map[string]interface{}{
			"totalRecords":     totalRecords,
			"activeEmployees":  activeEmployees,
			"totalGross":       totalGross,
			"totalNet":         totalNet,
			"totalMandatory":   totalMandatory,
			"totalLoanDeds":    totalLoanDeds,
			"processedCount":   processedCount,
			"pendingCount":     pendingCount,
			"currentPeriod":    currentPeriod,
			"periodNet":        0,
			"groupStats":       groupStatsToJSON(groups),
			"unassignedCount":  0,
			"activeLoanAccounts": 0,
			"dedTotalsByCode":  []interface{}{},
			"recentEmployees":  []interface{}{},
		})
	}
}

func handleRefreshDashboardCache(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		// In SQLite, cache refresh is a no-op since queries are real-time
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

// ── Payroll Handlers ───────────────────────────────────────────────────────

func handleRunPayroll(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			PeriodId string `json:"periodId"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		db := app.Dao().DB()

		// Get period
		var periodName string
		err := db.NewQuery("SELECT period_name FROM pay_periods WHERE id = {:id}").Bind(dbx.Params{"id": body.PeriodId}).Row(&periodName)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "Pay period not found"})
		}

		// Get active employees
		employees, _ := app.Dao().FindRecordsByFilter("employees", "status = 'Active'", "stacode")

		processedCount := 0
		for _, emp := range employees {
			// Get deductions for this employee
			deductions, _ := app.Dao().FindRecordsByFilter("payroll_deductions",
				"employee_id = {:emp_id} AND status = 'Active'",
				dbx.Params{"emp_id": emp.Id})

			// Compute payroll
			basic := emp.GetFloat("basic") + emp.GetFloat("basic_salary")
			pera := emp.GetFloat("pera")
			long := emp.GetFloat("long") + emp.GetFloat("ontop")
			gross := basic + pera + long

			// Mandatory deductions
			dedlnr := math.Round(basic*0.09*100) / 100
			phicTotal := basic * 0.05
			if phicTotal > 5000 {
				phicTotal = 5000
			}
			dedmed := math.Floor(phicTotal*50) / 100
			dedpag := 200.0
			taxableIncome := math.Max(0, basic-dedlnr-dedmed-dedpag)
			dedtax := computeWithholdingTax(taxableIncome)

			// Loan deductions (with NTHP)
			mandatoryLoanTotal := 0.0
			otherLoanTotal := 0.0
			for _, ded := range deductions {
				amt := ded.GetFloat("dedamt")
				dedCode := ded.GetString("dedcode")
				agency := ded.GetString("agency")

				if isMandatoryLoan(agency, ded.GetString("type")) {
					mandatoryLoanTotal += amt
				} else {
					otherLoanTotal += amt
				}
				_ = dedCode
			}

			mandatoryDeductions := dedlnr + dedmed + dedpag + dedtax + mandatoryLoanTotal
			availableBalance := gross - mandatoryDeductions
			capacity := math.Max(0, availableBalance-5000)
			actualLoanDeductions := math.Min(otherLoanTotal, capacity)
			netPay := availableBalance - actualLoanDeductions

			// Save payroll entry
			entryCollection, _ := app.Dao().FindCollectionByNameOrId("payroll_entries")
			entry := core.NewRecord(entryCollection)
			entry.Set("employee_id", emp.Id)
			entry.Set("pay_period_id", body.PeriodId)
			entry.Set("gross_pay", math.Round(gross*100)/100)
			entry.Set("total_deductions", math.Round((mandatoryDeductions+actualLoanDeductions)*100)/100)
			entry.Set("net_pay", math.Round(netPay*100)/100)
			entry.Set("status", "Computed")
			entry.Set("dedlnr", math.Round(dedlnr*100)/100)
			entry.Set("dedmed", math.Round(dedmed*100)/100)
			entry.Set("dedpag", dedpag)
			entry.Set("dedtax", math.Round(dedtax*100)/100)
			entry.Set("other_deductions", math.Round(actualLoanDeductions*100)/100)
			entry.Set("mandatory_deductions", math.Round(mandatoryDeductions*100)/100)
			entry.Set("available_balance", math.Round(availableBalance*100)/100)
			entry.Set("loan_deduction_capacity", math.Round(capacity*100)/100)
			entry.Set("actual_loan_deductions", math.Round(actualLoanDeductions*100)/100)
			entry.Set("nthp_status", "PASS")
			entry.Set("processed_at", time.Now().UTC().Format(time.RFC3339))

			if err := app.Dao().SaveRecord(entry); err == nil {
				processedCount++
			}
		}

		callerRecord, _ := getAuthRecord(e)
		if callerRecord != nil {
			logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "payroll_run", "payroll_entries", body.PeriodId, map[string]interface{}{
				"period":    periodName,
				"processed": processedCount,
			})
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"success":   true,
			"processed": processedCount,
		})
	}
}

func handleReversePayroll(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			PeriodId string `json:"periodId"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		db := app.Dao().DB()
		db.NewQuery("UPDATE payroll_entries SET status = 'Reversed' WHERE pay_period_id = {:id} AND status = 'Posted'").Bind(dbx.Params{"id": body.PeriodId}).Execute()

		callerRecord, _ := getAuthRecord(e)
		if callerRecord != nil {
			logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "payroll_reverse", "payroll_entries", body.PeriodId, nil)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handlePayrollEngineStats(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		db := app.Dao().DB()
		var totalEntries, postedEntries, computedEntries, reversedEntries int
		var totalNetPay float64
		db.NewQuery("SELECT COUNT(*), COUNT(CASE WHEN status='Posted' THEN 1 END), COUNT(CASE WHEN status='Computed' THEN 1 END), COUNT(CASE WHEN status='Reversed' THEN 1 END), COALESCE(SUM(net_pay),0) FROM payroll_entries").Row(
			&totalEntries, &postedEntries, &computedEntries, &reversedEntries, &totalNetPay,
		)
		return e.JSON(http.StatusOK, map[string]interface{}{
			"totalEntries":   totalEntries,
			"postedEntries":  postedEntries,
			"computedEntries": computedEntries,
			"reversedEntries": reversedEntries,
			"totalNetPay":    totalNetPay,
		})
	}
}

func handleGenerateMonthlyPeriods(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		// Accept both the Go-native field names (year/regcode/divcode) and the
		// legacy p_-prefixed RPC names (p_year/p_regcode/p_divcode) so the route
		// binds correctly no matter which client payload is sent.
		var body struct {
			Year     int    `json:"year"`
			Regcode  string `json:"regcode"`
			Divcode  string `json:"divcode"`
			PYear    int    `json:"p_year"`
			PRegcode string `json:"p_regcode"`
			PDivcode string `json:"p_divcode"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		if body.Year == 0 {
			body.Year = body.PYear
		}
		if body.Regcode == "" {
			body.Regcode = body.PRegcode
		}
		if body.Divcode == "" {
			body.Divcode = body.PDivcode
		}
		if body.Year == 0 {
			body.Year = time.Now().Year()
		}

		collection, _ := app.Dao().FindCollectionByNameOrId("pay_periods")
		created := 0
		monthNames := []string{"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December"}

		for month := 1; month <= 12; month++ {
			startDate := time.Date(body.Year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
			endDate := startDate.AddDate(0, 1, -1)
			payDate := startDate.AddDate(0, 1, 14)
			periodName := fmt.Sprintf("%s %d", monthNames[month-1], body.Year)

			// Check if period already exists for THIS division (REGCODE + DIVCODE
			// are the unique reference for one division's pay periods). A period for
			// another division must never block this one from being created, and
			// duplicates within a division are prevented by the unique index.
			existing, _ := app.Dao().FindFirstRecordByFilter("pay_periods",
				"year = {:year} AND month = {:month} AND COALESCE(regcode,'') = {:regcode} AND COALESCE(divcode,'') = {:divcode}",
				dbx.Params{"year": body.Year, "month": month, "regcode": body.Regcode, "divcode": body.Divcode})
			if existing != nil {
				continue
			}

			record := core.NewRecord(collection)
			record.Set("period_name", periodName)
			record.Set("start_date", startDate.Format("2006-01-02"))
			record.Set("end_date", endDate.Format("2006-01-02"))
			record.Set("pay_date", payDate.Format("2006-01-02"))
			record.Set("frequency", "Monthly")
			record.Set("status", "draft")
			record.Set("month", month)
			record.Set("year", body.Year)
			record.Set("period_number", month)
			record.Set("regcode", body.Regcode)
			record.Set("divcode", body.Divcode)

			if err := app.Dao().SaveRecord(record); err == nil {
				created++
			}
		}

		return e.JSON(http.StatusOK, map[string]interface{}{"created": created})
	}
}

func handleDeductionEngineStats(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		db := app.Dao().DB()
		var totalDeductions, grossPay float64
		var activeCount int
		db.NewQuery("SELECT COALESCE(SUM(pd.dedamt),0), (SELECT COALESCE(SUM(COALESCE(basic,0)+COALESCE(basic_salary,0)+COALESCE(pera,0)),0) FROM employees WHERE status='Active'), COUNT(*) FROM payroll_deductions pd LEFT JOIN deduction_codes dc ON pd.dedcode = dc.dedcode WHERE pd.status = 'Active' AND dc.active = true").Row(
			&totalDeductions, &grossPay, &activeCount,
		)
		return e.JSON(http.StatusOK, map[string]interface{}{
			"totalDeductions": totalDeductions,
			"grossPay":        grossPay,
			"netPay":          grossPay - totalDeductions,
			"activeCount":     activeCount,
			"groupTotals":     []interface{}{},
		})
	}
}

// ── Employee Handlers ──────────────────────────────────────────────────────

func handleQueryEmployees(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		// Accept both GET query params and the POST JSON body sent by
		// supabase.rpc('query_employees', {...}). The frontend's
		// useServerPagination sends p_search / p_stacode_min / p_stacode_max /
		// p_regcode / p_divcodes / p_page / p_page_size / p_count_only.
		var body struct {
			PSearch      *string  `json:"p_search"`
			PStacodeMin  *int     `json:"p_stacode_min"`
			PStacodeMax  *int     `json:"p_stacode_max"`
			PScopeColumn *string  `json:"p_scope_column"`
			PScopeValue  *string  `json:"p_scope_value"`
			PDivisionIds []string `json:"p_division_ids"`
			PRegcode     *string  `json:"p_regcode"`
			PDivcodes    []string `json:"p_divcodes"`
			PPage        *int     `json:"p_page"`
			PPageSize    *int     `json:"p_page_size"`
			PCountOnly   *bool    `json:"p_count_only"`
		}
		_ = e.BindBody(&body)

		q := e.Request.URL.Query()
		search := ""
		if body.PSearch != nil && *body.PSearch != "" {
			search = *body.PSearch
		} else {
			search = q.Get("search")
			if search == "" {
				search = q.Get("p_search")
			}
		}
		_ = search

		// Page is 0-based from useServerPagination; legacy GET callers use 1-based.
		page := 0
		perPage := 10
		if body.PPage != nil {
			page = *body.PPage
		} else if s := q.Get("page"); s != "" {
			if v, err := strconv.Atoi(s); err == nil {
				page = v - 1
				if page < 0 {
					page = 0
				}
			}
		}
		if body.PPageSize != nil && *body.PPageSize > 0 {
			perPage = *body.PPageSize
		} else if s := q.Get("perPage"); s != "" {
			if v, err := strconv.Atoi(s); err == nil && v > 0 {
				perPage = v
			}
		} else if s := q.Get("p_page_size"); s != "" {
			if v, err := strconv.Atoi(s); err == nil && v > 0 {
				perPage = v
			}
		}
		if perPage <= 0 {
			perPage = 10
		}

		stacodeMin := -1
		stacodeMax := -1
		if body.PStacodeMin != nil {
			stacodeMin = *body.PStacodeMin
		}
		if body.PStacodeMax != nil {
			stacodeMax = *body.PStacodeMax
		}
		legacyStacode := q.Get("stacode")

		regcode := ""
		if body.PRegcode != nil {
			regcode = strings.TrimSpace(*body.PRegcode)
		}
		divcodes := body.PDivcodes
		scopeCol := ""
		scopeVal := ""
		if body.PScopeColumn != nil {
			scopeCol = *body.PScopeColumn
		}
		if body.PScopeValue != nil {
			scopeVal = *body.PScopeValue
		}

		// Hardcoded `employees` table — the only source for Employee Records.
		records, err := app.Dao().FindRecordsByFilter("employees", "1 = 1")
		if err != nil {
			return e.JSON(http.StatusOK, map[string]interface{}{"rows": []interface{}{}, "data": []interface{}{}, "total": 0})
		}

		lower := func(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
		searchL := lower(search)
		filtered := make([]*core.Record, 0, len(records))
		for _, r := range records {
			empno := r.GetString("empno")
			if empno == "" {
				empno = r.GetString("employee_number")
			}
			stacode := r.GetString("stacode")
			lname := r.GetString("lname")
			if lname == "" {
				lname = r.GetString("last_name")
			}
			fname := r.GetString("fname")
			if fname == "" {
				fname = r.GetString("first_name")
			}
			mi := r.GetString("mi")
			if mi == "" {
				mi = r.GetString("middle_name")
			}

			if legacyStacode != "" && stacode != legacyStacode {
				continue
			}
			if stacodeMin >= 0 && stacodeMax >= 0 {
				n := -1
				digits := ""
				for _, c := range stacode {
					if c >= '0' && c <= '9' {
						digits += string(c)
					} else if digits != "" {
						break
					}
				}
				if digits != "" {
					if v, err := strconv.Atoi(digits); err == nil {
						n = v
					}
				}
				if n < stacodeMin || n > stacodeMax {
					continue
				}
			}
			if scopeCol != "" && scopeVal != "" {
				if scopeCol == "stacode" && stacode != scopeVal {
					continue
				}
				if scopeCol == "empno" && empno != scopeVal && r.GetString("employee_number") != scopeVal {
					continue
				}
			}
			if regcode != "" && r.GetString("regcode") != regcode {
				continue
			}
			if len(divcodes) > 0 && !containsStr(divcodes, r.GetString("divcode")) {
				continue
			}
			if searchL != "" {
				hay := lower(strings.Join([]string{empno, r.GetString("employee_number"), lname, fname, mi, r.GetString("empname"), stacode}, " "))
				if !strings.Contains(hay, searchL) {
					continue
				}
			}
			filtered = append(filtered, r)
		}

		total := len(filtered)
		if body.PCountOnly != nil && *body.PCountOnly {
			return e.JSON(http.StatusOK, map[string]interface{}{"rows": []interface{}{}, "data": []interface{}{}, "total": total})
		}
		start := page * perPage
		if start > total {
			start = total
		}
		end := start + perPage
		if end > total {
			end = total
		}

		result := make([]map[string]interface{}, 0, end-start)
		for _, r := range filtered[start:end] {
			result = append(result, recordToMap(r))
		}

		// Return BOTH shapes: { rows, total } for useServerPagination and
		// { data, ... } for legacy callers.
		return e.JSON(http.StatusOK, map[string]interface{}{
			"rows":    result,
			"data":    result,
			"total":   total,
			"page":    page,
			"perPage": perPage,
		})
	}
}

func handleSetEmployeeNumber(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			EmployeeId    string `json:"employeeId"`
			EmployeeNumber string `json:"employeeNumber"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}

		emp, err := app.Dao().FindRecordById("employees", body.EmployeeId)
		if err != nil {
			return e.JSON(http.StatusNotFound, map[string]string{"error": "Employee not found"})
		}
		emp.Set("empno", body.EmployeeNumber)
		emp.Set("employee_number", body.EmployeeNumber)
		app.Dao().SaveRecord(emp)

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

// ── DBF Handlers ───────────────────────────────────────────────────────────

func handleDbfTableCounts(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		db := app.Dao().DB()
		type TableCount struct {
			Table      string `json:"table_name"`
			Total      int    `json:"total"`
			Elementary int    `json:"elementary"`
			Highschool int    `json:"highschool"`
		}
		// `employees` is the hardcoded MASTFILE target — always counted first
		// so Smart Import status can never show a false zero.
		// `payroll_deductions` is the DEDFILE target (TABLE_TO_DB maps DEDFILE there).
		tables := []string{"employees", "payroll_deductions", "dbf_stntable", "dbf_divtable", "dbf_included", "dbf_excluded", "dbf_payrolls", "dbf_pyent", "dbf_pyent1", "dbf_pyent2"}
		result := []TableCount{}

		for _, t := range tables {
			tc := TableCount{Table: t}
			if err := db.NewQuery(fmt.Sprintf("SELECT COUNT(*) FROM %s", t)).Row(&tc.Total); err != nil {
				tc.Total = 0
			}
			if t != "dbf_divtable" {
				// SQLite has no `~` regex operator — count category splits in
				// Go from the stacode column instead.
				records, err := app.Dao().FindRecordsByFilter(t, "1 = 1")
				if err == nil {
					for _, r := range records {
						digits := ""
						for _, c := range r.GetString("stacode") {
							if c >= '0' && c <= '9' {
								digits += string(c)
							} else if digits != "" {
								break
							}
						}
						if digits == "" {
							continue
						}
						if v, err := strconv.Atoi(digits); err == nil {
							if v >= 1 && v <= 499 {
								tc.Elementary++
							} else if v >= 500 && v <= 701 {
								tc.Highschool++
							}
						}
					}
				}
			}
			result = append(result, tc)
		}

		return e.JSON(http.StatusOK, result)
	}
}

func handleQueryDedfile(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			PSearch     string   `json:"p_search"`
			PStacode    string   `json:"p_stacode"`
			PDedcode    string   `json:"p_dedcode"`
			PEmpno      string   `json:"p_empno"`
			PPeriod     string   `json:"p_period"`
			PStacodeMin string   `json:"p_stacode_min"`
			PStacodeMax string   `json:"p_stacode_max"`
			PDivision   []string `json:"p_division_ids"`
			PRegcode    string   `json:"p_regcode"`
			PDivcodes   []string `json:"p_divcodes"`
			PSortKey    string   `json:"p_sort_key"`
			PSortDir    string   `json:"p_sort_dir"`
			PPage       int      `json:"p_page"`
			PPageSize   int      `json:"p_page_size"`
			PCountOnly  bool     `json:"p_count_only"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		}
		if body.PSortKey == "" {
			body.PSortKey = "empno"
		}
		if body.PSortDir == "" {
			body.PSortDir = "asc"
		}
		page := body.PPage
		if page < 0 {
			page = 0
		}
		pageSize := body.PPageSize
		if pageSize <= 0 {
			pageSize = 50
		}

		deds, _ := app.Dao().FindRecordsByFilter("payroll_deductions", "1 = 1")
		emps, _ := app.Dao().FindRecordsByFilter("employees", "1 = 1")
		empMap := map[string]*core.Record{}
		for _, em := range emps {
			empMap[em.Id] = em
		}

		rows := make([]map[string]interface{}, 0)
		q := strings.ToLower(body.PSearch)
		for _, d := range deds {
			emp, ok := empMap[d.GetString("employee_id")]
			empno, lname, fname, mi, appel := "", "", "", "", ""
			stacode := d.GetString("stacode")
			regcode, divcode := "", ""
			netpay := float64(0)
			if ok {
				empno = emp.GetString("empno")
				if empno == "" {
					empno = emp.GetString("employee_number")
				}
				lname = emp.GetString("lname")
				if lname == "" {
					lname = emp.GetString("last_name")
				}
				fname = emp.GetString("fname")
				if fname == "" {
					fname = emp.GetString("first_name")
				}
				mi = emp.GetString("mi")
				appel = emp.GetString("appel")
				if stacode == "" {
					stacode = emp.GetString("stacode")
				}
				regcode = emp.GetString("regcode")
				divcode = emp.GetString("divcode")
				netpay = emp.GetFloat("netpay")
			}

			dedcode := d.GetString("dedcode")
			dedid := d.GetString("dedid")
			if dedid == "" {
				dedid = dedcode
			}
			periodID := ""
			dn := d.GetFloat("dedamt")

			if body.PStacode != "" && stacode != body.PStacode {
				continue
			}
			if body.PDedcode != "" && !strings.EqualFold(dedcode, body.PDedcode) {
				continue
			}
			if body.PEmpno != "" && !strings.Contains(strings.ToLower(empno), strings.ToLower(body.PEmpno)) {
				continue
			}
			if body.PPeriod != "" && periodID != "" && !strings.Contains(periodID, body.PPeriod) {
				continue
			}
			if body.PRegcode != "" && regcode != body.PRegcode {
				continue
			}
			if len(body.PDivcodes) > 0 && !containsStr(body.PDivcodes, divcode) {
				continue
			}
			if body.PStacodeMin != "" {
				vn, err1 := strconv.ParseFloat(stacode, 64)
				mn, err2 := strconv.ParseFloat(body.PStacodeMin, 64)
				if err1 == nil && err2 == nil && vn < mn {
					continue
				}
			}
			if body.PStacodeMax != "" {
				vn, err1 := strconv.ParseFloat(stacode, 64)
				mx, err2 := strconv.ParseFloat(body.PStacodeMax, 64)
				if err1 == nil && err2 == nil && vn > mx {
					continue
				}
			}
			if q != "" {
				hay := strings.ToLower(strings.Join([]string{empno, lname, fname, dedcode, dedid, d.GetString("policyno")}, " "))
				if !strings.Contains(hay, q) {
					continue
				}
			}

			m := recordToMap(d)
			m["empno"] = empno
			m["lname"] = lname
			m["last_name"] = lname
			m["fname"] = fname
			m["first_name"] = fname
			m["mi"] = mi
			m["appel"] = appel
			m["stacode"] = stacode
			m["regcode"] = regcode
			m["divcode"] = divcode
			m["netpay"] = netpay
			m["dedcode"] = dedcode
			m["dedid"] = dedid
			m["dedamt"] = dn
			rows = append(rows, m)
		}

		total := len(rows)
		sort.Slice(rows, func(i, j int) bool {
			less := dedLess(rows[i], rows[j], body.PSortKey)
			if strings.ToLower(body.PSortDir) == "desc" {
				return !less && rows[i][body.PSortKey] != rows[j][body.PSortKey]
			}
			return less
		})
		if body.PCountOnly {
			return e.JSON(http.StatusOK, map[string]interface{}{"rows": []interface{}{}, "total": total})
		}
		start := page * pageSize
		if start > total {
			start = total
		}
		end := start + pageSize
		if end > total {
			end = total
		}
		return e.JSON(http.StatusOK, map[string]interface{}{"rows": rows[start:end], "total": total})
	}
}

func containsStr(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func dedLess(a, b map[string]interface{}, key string) bool {
	av, aok := a[key]
	bv, bok := b[key]
	if aok && bok {
		af, aerr := strconv.ParseFloat(fmt.Sprintf("%v", av), 64)
		bf, berr := strconv.ParseFloat(fmt.Sprintf("%v", bv), 64)
		if aerr == nil && berr == nil {
			return af < bf
		}
	}
	as, bs := fmt.Sprintf("%v", av), fmt.Sprintf("%v", bv)
	if as == bs {
		return fmt.Sprintf("%v", a["id"]) < fmt.Sprintf("%v", b["id"])
	}
	return as < bs
}

func handleDbfRestore(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		// DBF restore is handled via file upload in the frontend
		// This endpoint processes the uploaded data
		return e.JSON(http.StatusOK, map[string]interface{}{"success": true, "message": "Use the file upload endpoint for DBF restore"})
	}
}

// ── Lockdown Handlers ──────────────────────────────────────────────────────

func handleLockdownActivate(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			Reason string `json:"reason"`
		}
		e.BindBody(&body)

		db := app.Dao().DB()
		db.NewQuery("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('lockdown', {:val}, datetime('now'))").Bind(dbx.Params{
			"val": fmt.Sprintf(`{"locked":true,"reason":"%s"}`, body.Reason),
		}).Execute()

		callerRecord, _ := getAuthRecord(e)
		if callerRecord != nil {
			logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "lockdown_activated", "system_settings", "lockdown", map[string]interface{}{
				"reason": body.Reason,
			})
		}

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

func handleLockdownDeactivate(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		db := app.Dao().DB()
		db.NewQuery("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('lockdown', {:val}, datetime('now'))").Bind(dbx.Params{
			"val": `{"locked":false}`,
		}).Execute()

		callerRecord, _ := getAuthRecord(e)
		if callerRecord != nil {
			logAudit(app, callerRecord.Id, callerRecord.GetString("email"), "lockdown_deactivated", "system_settings", "lockdown", nil)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{"success": true})
	}
}

// ── Audit Handlers ─────────────────────────────────────────────────────────

func handleGetAuditLogs(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		page, _ := strconv.Atoi(e.Request.URL.Query().Get("page"))
		perPage, _ := strconv.Atoi(e.Request.URL.Query().Get("perPage"))
		if page <= 0 { page = 1 }
		if perPage <= 0 { perPage = 50 }

		records, _ := app.Dao().FindRecordsByFilter("audit_logs", "1 = 1", "-created_at")
		total := len(records)
		start := (page - 1) * perPage
		end := start + perPage
		if start > total { start = total }
		if end > total { end = total }

		result := make([]map[string]interface{}, 0)
		for _, r := range records[start:end] {
			result = append(result, recordToMap(r))
		}
		return e.JSON(http.StatusOK, map[string]interface{}{"data": result, "total": total})
	}
}

// ── School Handlers ────────────────────────────────────────────────────────

func handleSchoolStats(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		db := app.Dao().DB()
		var totalSchools, elementary, highschool, implementing int
		db.NewQuery("SELECT COUNT(*) FROM schools").Row(&totalSchools)
		db.NewQuery("SELECT COUNT(*) FROM schools WHERE school_type = 'Elementary'").Row(&elementary)
		db.NewQuery("SELECT COUNT(*) FROM schools WHERE school_type = 'High School'").Row(&highschool)
		db.NewQuery("SELECT COUNT(*) FROM implementing_units").Row(&implementing)

		return e.JSON(http.StatusOK, map[string]interface{}{
			"totalSchools":   totalSchools,
			"elementary":     elementary,
			"highschool":     highschool,
			"implementing":   implementing,
		})
	}
}

func handleQuerySchoolsWithStats(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var body struct {
			SchoolType   string   `json:"p_school_type"`
			DivisionIds  []string `json:"p_division_ids"`
			Regcode      *string  `json:"p_regcode"`
			Divcodes     []string `json:"p_divcodes"`
		}
		if err := e.BindBody(&body); err != nil {
			return e.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		}

		filter := "1 = 1"
		params := dbx.Params{}
		if body.SchoolType != "" {
			filter += " && school_type = {:school_type}"
			params["school_type"] = body.SchoolType
		}
		if len(body.DivisionIds) > 0 {
			placeholders := make([]string, len(body.DivisionIds))
			for i, id := range body.DivisionIds {
				key := fmt.Sprintf("divid%d", i)
				placeholders[i] = fmt.Sprintf(":{%s}", key)
				params[key] = id
			}
			filter += fmt.Sprintf(" && division_id IN (%s)", strings.Join(placeholders, ","))
		}

		records, err := app.Dao().FindRecordsByFilter("schools", filter, "-school_code", 0, 0, params)
		if err != nil {
			return e.JSON(http.StatusOK, []interface{}{})
		}

		db := app.Dao().DB()

		// Build a map of stacode → employee count
		empCounts := map[string]int{}
		empRows, _ := db.NewQuery(
			"SELECT stacode, COUNT(*) as cnt FROM employees WHERE stacode != '' AND stacode IS NOT NULL GROUP BY stacode",
		).Rows()
		if empRows != nil {
			defer empRows.Close()
			for empRows.Next() {
				var sc string
				var cnt int
				empRows.Scan(&sc, &cnt)
				empCounts[sc] = cnt
			}
		}

		result := make([]map[string]interface{}, 0, len(records))
		for _, r := range records {
			m := recordToMap(r)
			stacode := r.GetString("school_code")
			total := empCounts[stacode]
			m["total_employees"] = total
			m["teaching_personnel"] = 0
			m["non_teaching_personnel"] = total
			m["active_payroll_employees"] = 0
			result = append(result, m)
		}

		return e.JSON(http.StatusOK, result)
	}
}

// ── Import Log Handlers ────────────────────────────────────────────────────

func handleGetImportLogs(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		page, _ := strconv.Atoi(e.Request.URL.Query().Get("page"))
		if page <= 0 { page = 1 }

		table := e.Request.URL.Query().Get("table")
		if table == "" {
			table = "pli_import_logs"
		}

		records, _ := app.Dao().FindRecordsByFilter(table, "1 = 1", "-created_at")
		result := make([]map[string]interface{}, 0)
		for i, r := range records {
			if i >= 50 { break }
			result = append(result, recordToMap(r))
		}
		return e.JSON(http.StatusOK, result)
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

func recordToMap(r *core.Record) map[string]interface{} {
	m := map[string]interface{}{
		"id":         r.Id,
		"created_at": r.Created.Time().Format(time.RFC3339),
		"updated_at": r.Updated.Time().Format(time.RFC3339),
	}
	for k, v := range r.PublicExport() {
		if k != "id" && k != "created" && k != "updated" {
			switch vv := v.(type) {
			case types.JsonMap:
				m[k] = map[string]interface{}(vv)
			default:
				m[k] = v
			}
		}
	}
	return m
}

func logAudit(app *pocketbase.PocketBase, userId string, userEmail string, action string, recordType string, recordId string, details map[string]interface{}) {
	go func() {
		collection, err := app.Dao().FindCollectionByNameOrId("audit_logs")
		if err != nil {
			return
		}
		record := core.NewRecord(collection)
		record.Set("user_id", userId)
		record.Set("user_email", userEmail)
		record.Set("action", action)
		record.Set("record_type", recordType)
		record.Set("record_id", recordId)
		if details != nil {
			b, _ := json.Marshal(details)
			record.Set("details", string(b))
		}
		app.Dao().SaveRecord(record)
	}()
}

func generateOTP() string {
	b := make([]byte, 3)
	rand.Read(b)
	code := fmt.Sprintf("%06d", uint32(b[0])<<16|uint32(b[1])<<8|uint32(b[2]))
	return code[:6]
}

func computeWithholdingTax(taxableIncome float64) float64 {
	type bracket struct {
		max  float64
		base float64
		rate float64
	}
	brackets := []bracket{
		{20833, 0, 0},
		{33333, 0, 0.15},
		{66667, 1875, 0.20},
		{166667, 8541.67, 0.25},
		{666667, 33541.67, 0.30},
		{math.MaxFloat64, 183541.67, 0.35},
	}
	ti := math.Max(0, taxableIncome)
	for i, b := range brackets {
		if ti <= b.max {
			prevMax := 0.0
			if i > 0 {
				prevMax = brackets[i-1].max
			}
			return math.Round((b.base+(ti-prevMax)*b.rate)*100) / 100
		}
	}
	return 0
}

func isMandatoryLoan(agency string, dedType string) bool {
	agency = strings.ToUpper(strings.TrimSpace(agency))
	dedType = strings.ToUpper(strings.TrimSpace(dedType))
	if agency == "BIR" || agency == "PHIC" || agency == "PHILHEALTH" || agency == "GSIS" {
		return true
	}
	if (agency == "HDMF" || agency == "PAGIBIG" || agency == "PAG-IBIG") &&
		(dedType == "L" || dedType == "LOAN" || dedType == "MANDATORY" || dedType == "P" || dedType == "PROVIDENT" || dedType == "SAVINGS") {
		return true
	}
	return false
}

func groupStatsToJSON(groups []*core.Record) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)
	for _, g := range groups {
		result = append(result, map[string]interface{}{
			"id":          g.Id,
			"group_code":  g.GetString("group_code"),
			"group_name":  g.GetString("group_name"),
			"stacode_min": g.GetInt("stacode_min"),
			"stacode_max": g.GetInt("stacode_max"),
		})
	}
	return result
}

func mustMarshal(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func init() {
	// Register SQLite driver
	sql.Register("sqlite", &sqlite.Driver{})
}
