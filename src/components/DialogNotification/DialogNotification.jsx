import PropTypes from "prop-types";
import React from "react";
import { Clear } from "../Clear";
import { Error } from "../Error";
import { Warning } from "../Warning";
import { Success } from "../Success";
import "./style.css";
import { Button } from "@/components/Button/Button";

const DialogNotification = ({
  type = "info",
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "אישור",
  cancelText = "ביטול",
  className = "",
  hideCancel = false,
}) => {
  return (
    <div className="dialog-notification-wrapper">
      <div className={`dialog-notification ${className}`}>
        
        {/* פס צבע עליון */}
        <div className={`dialog-header-bar type-${type}`} />

        {/* כותרת + אייקון + סגירה */}
        <div className="dialog-header">
          <div className="dialog-icon">
            {type === "success" && <Success success="/static/img/success-1.png" />}
            {type === "warning" && <Warning warning="/static/img/warning-2.png" />}
            {type === "error" && <Error error="/static/img/error-4.png" />}
          </div>

          <div className={`dialog-title type-${type}`}>{title}</div>

          {/* כפתור X – מוצג רק אם !hideCancel */}
          {!hideCancel && onCancel && (
            <div className="dialog-close" onClick={onCancel}>
              <Clear clear="/static/img/clear-4.png" />
            </div>
          )}
        </div>

        {/* הודעה */}
        <div className="dialog-message">
          {typeof message === "string" ? (
            <pre className="dialog-message-pre">{message}</pre>
          ) : (
            message
          )}
        </div>

        {/* כפתורי פעולה */}
        <div className="dialog-buttons">
          <Button
            type="primary"
            text={confirmText}
            onClick={onConfirm}
            icon="off"
            state="default"
          />
          {!hideCancel && onCancel && (
            <Button
              type="secondary"
              text={cancelText}
              onClick={onCancel}
              icon="off"
              state="default"
            />
          )}
        </div>
      </div>
    </div>
  );
};

DialogNotification.propTypes = {
  type: PropTypes.oneOf(["warning", "success", "error", "info"]),
  title: PropTypes.string.isRequired,
  message: PropTypes.node.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func, // כבר לא חובה
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  className: PropTypes.string,
  hideCancel: PropTypes.bool, // פרופ חדש
};

export default DialogNotification;
