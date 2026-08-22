/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  MagicTouchFlowBranch,
  MagicTouchFlowDocument,
  MagicTouchFlowValidationIssue,
  MagicTouchFlowValidationResult,
} from "./magicTouchFlowAdminTypes";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function getBranches(
  value: unknown
): MagicTouchFlowBranch[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value.map(
    (
      branch: any,
      index
    ) => ({
      id:
        s(
          branch?.id
        ) ||
        `branch_${index + 1}`,
      value:
        s(
          branch?.value
        ),
      label:
        s(
          branch?.label
        ) ||
        undefined,
      nextStepId:
        s(
          branch?.nextStepId
        ) ||
        null,
    })
  );
}

export function validateMagicTouchFlow(
  flow: Partial<MagicTouchFlowDocument>
): MagicTouchFlowValidationResult {
  const issues:
    MagicTouchFlowValidationIssue[] =
    [];

  const add =
    (
      code: string,
      path: string,
      message: string,
      severity:
        | "error"
        | "warning" =
        "error"
    ) => {
      issues.push({
        code,
        path,
        message,
        severity,
      });
    };

  if (
    !s(
      flow.name
    )
  ) {
    add(
      "flow_name_missing",
      "name",
      "חסר שם לתהליך."
    );
  }

  if (
    !flow.trigger ||
    !s(
      flow.trigger
        .type
    )
  ) {
    add(
      "trigger_missing",
      "trigger.type",
      "חסר Trigger לתהליך."
    );
  }

  const steps =
    flow.steps &&
    typeof flow.steps ===
      "object" &&
    !Array.isArray(
      flow.steps
    )
      ? flow.steps
      : {};

  if (
    !Object.keys(
      steps
    ).length
  ) {
    add(
      "steps_missing",
      "steps",
      "התהליך חייב לכלול לפחות שלב אחד."
    );
  }

  const firstStepId =
    s(
      flow.firstStepId
    );

  if (
    !firstStepId
  ) {
    add(
      "first_step_missing",
      "firstStepId",
      "לא הוגדר שלב ראשון."
    );
  } else if (
    !steps[
      firstStepId
    ]
  ) {
    add(
      "first_step_not_found",
      "firstStepId",
      `השלב הראשון "${firstStepId}" אינו קיים.`
    );
  }

  for (
    const [
      stepId,
      step,
    ] of Object.entries(
      steps
    )
  ) {
    if (
      s(
        step.id
      ) !==
      stepId
    ) {
      add(
        "step_id_mismatch",
        `steps.${stepId}.id`,
        "מזהה השלב אינו זהה למפתח שלו."
      );
    }

    if (
      step.type ===
      "condition"
    ) {
      const field =
        s(
          step.config
            ?.field
        );

      if (
        !field
      ) {
        add(
          "condition_field_missing",
          `steps.${stepId}.config.field`,
          "בשלב ניתוב חסר שדה לניתוב."
        );
      }

      const branches =
        getBranches(
          step.config
            ?.branches
        );

      if (
        branches.length <
        2
      ) {
        add(
          "condition_branches_missing",
          `steps.${stepId}.config.branches`,
          "שלב ניתוב חייב לכלול לפחות שני ענפים."
        );
      }

      const values =
        new Set<string>();

      const ids =
        new Set<string>();

      branches.forEach(
        (
          branch,
          index
        ) => {
          const path =
            `steps.${stepId}.config.branches.${index}`;

          if (
            !branch.id
          ) {
            add(
              "condition_branch_id_missing",
              `${path}.id`,
              "חסר מזהה לענף."
            );
          } else if (
            ids.has(
              branch.id
            )
          ) {
            add(
              "condition_branch_id_duplicate",
              `${path}.id`,
              `מזהה הענף "${branch.id}" מופיע יותר מפעם אחת.`
            );
          } else {
            ids.add(
              branch.id
            );
          }

          if (
            !branch.value
          ) {
            add(
              "condition_branch_value_missing",
              `${path}.value`,
              "חסר ערך לענף."
            );
          } else {
            const normalized =
              branch.value
                .toLowerCase();

            if (
              values.has(
                normalized
              )
            ) {
              add(
                "condition_branch_value_duplicate",
                `${path}.value`,
                `הערך "${branch.value}" מופיע ביותר מענף אחד.`
              );
            } else {
              values.add(
                normalized
              );
            }
          }

          if (
            !branch.nextStepId
          ) {
            add(
              "condition_branch_target_missing",
              `${path}.nextStepId`,
              `לענף "${branch.label || branch.value || index + 1}" לא הוגדר שלב המשך.`
            );
          } else if (
            branch.nextStepId ===
            stepId
          ) {
            add(
              "condition_branch_self_reference",
              `${path}.nextStepId`,
              "ענף לא יכול לחזור לאותו שלב ניתוב."
            );
          } else if (
            !steps[
              branch.nextStepId
            ]
          ) {
            add(
              "condition_branch_target_not_found",
              `${path}.nextStepId`,
              `שלב ההמשך "${branch.nextStepId}" אינו קיים.`
            );
          }
        }
      );

      const fallbackStepId =
        s(
          step.config
            ?.fallbackStepId
        );

      if (
        fallbackStepId
      ) {
        if (
          fallbackStepId ===
          stepId
        ) {
          add(
            "condition_fallback_self_reference",
            `steps.${stepId}.config.fallbackStepId`,
            "מסלול ברירת המחדל לא יכול לחזור לאותו שלב."
          );
        } else if (
          !steps[
            fallbackStepId
          ]
        ) {
          add(
            "condition_fallback_not_found",
            `steps.${stepId}.config.fallbackStepId`,
            `שלב ברירת המחדל "${fallbackStepId}" אינו קיים.`
          );
        }
      }

      continue;
    }

    const nextStepId =
      s(
        step.nextStepId
      );

    if (
      step.type !==
        "end" &&
      nextStepId &&
      !steps[
        nextStepId
      ]
    ) {
      add(
        "next_step_missing",
        `steps.${stepId}.nextStepId`,
        `השלב הבא "${nextStepId}" אינו קיים.`
      );
    }

    if (
      step.type ===
      "send_whatsapp"
    ) {
      const message =
        s(
          step.config
            ?.message
        );

      if (
        !message
      ) {
        add(
          "whatsapp_message_missing",
          `steps.${stepId}.config.message`,
          "בשלב WhatsApp חסר תוכן הודעה."
        );
      }

      const mode =
        s(
          step.config
            ?.mode
        );

      if (
        mode ===
        "interactive_buttons"
      ) {
        const buttons =
          Array.isArray(
            step.config
              ?.buttons
          )
            ? step.config
                ?.buttons as any[]
            : [];

        if (
          buttons.length <
          1
        ) {
          add(
            "whatsapp_buttons_missing",
            `steps.${stepId}.config.buttons`,
            "בהודעת WhatsApp עם כפתורים יש להגדיר לפחות כפתור אחד."
          );
        }

        if (
          buttons.length >
          3
        ) {
          add(
            "whatsapp_buttons_too_many",
            `steps.${stepId}.config.buttons`,
            "WhatsApp מאפשר עד 3 כפתורי תשובה."
          );
        }

        const buttonIds =
          new Set<string>();

        buttons.forEach(
          (
            button: any,
            index: number
          ) => {
            const buttonId =
              s(
                button?.id
              );

            const buttonTitle =
              s(
                button?.title
              );

            const path =
              `steps.${stepId}.config.buttons.${index}`;

            if (
              !buttonId
            ) {
              add(
                "whatsapp_button_action_missing",
                `${path}.id`,
                "לכפתור חסר Action עסקי."
              );
            } else if (
              buttonIds.has(
                buttonId
              )
            ) {
              add(
                "whatsapp_button_action_duplicate",
                `${path}.id`,
                `ה־Action "${buttonId}" מופיע ביותר מכפתור אחד.`
              );
            } else {
              buttonIds.add(
                buttonId
              );
            }

            if (
              !buttonTitle
            ) {
              add(
                "whatsapp_button_title_missing",
                `${path}.title`,
                "לכפתור חסר טקסט שיוצג ללקוח."
              );
            } else if (
              buttonTitle.length >
              20
            ) {
              add(
                "whatsapp_button_title_too_long",
                `${path}.title`,
                "טקסט כפתור WhatsApp יכול להכיל עד 20 תווים."
              );
            }

            if (
              buttonId.length >
              256
            ) {
              add(
                "whatsapp_button_action_too_long",
                `${path}.id`,
                "Action של כפתור WhatsApp ארוך מדי."
              );
            }
          }
        );
      }
    } else if (
      step.type ===
      "wait_for_customer_response"
    ) {
    const rawExpectedActions =
  step.config
    ?.expectedActions;

const expectedActions: string[] =
  Array.isArray(
    rawExpectedActions
  )
    ? rawExpectedActions
        .map(
          (
            value: any
          ) =>
            s(
              value
            )
        )
        .filter(
          Boolean
        )
    : [];
   if (
  expectedActions.length ===
  0
) {
  add(
    "customer_response_actions_missing",
    `steps.${stepId}.config.expectedActions`,
    "בשלב המתנה לתשובת לקוח יש להגדיר לפחות פעולה עסקית אחת."
  );
}
      if (
        !nextStepId
      ) {
        add(
          "customer_response_next_step_missing",
          `steps.${stepId}.nextStepId`,
          "לא הוגדר שלב המשך לאחר קבלת תשובת הלקוח."
        );
      }
    } else if (
      step.type ===
        "update_contact" &&
      (
        !step.config
          ?.updates ||
        !Object.keys(
          step.config
            .updates as any
        ).length
      )
    ) {
      add(
        "contact_updates_missing",
        `steps.${stepId}.config.updates`,
        "בשלב עדכון איש קשר חסרים שדות."
      );
    } else if (
      step.type ===
        "add_timeline_event" &&
      !s(
        step.config
          ?.title
      )
    ) {
      add(
        "timeline_title_missing",
        `steps.${stepId}.config.title`,
        "באירוע Timeline חסרה כותרת."
      );
    } else if (
      step.type ===
      "sync_surense_activity"
    ) {
      if (
        !s(
          step.config
            ?.activityType
        )
      ) {
        add(
          "surense_activity_type_missing",
          `steps.${stepId}.config.activityType`,
          "בשלב Surense חסר Activity Type."
        );
      }

      if (
        !s(
          step.config
            ?.note
        )
      ) {
        add(
          "surense_note_missing",
          `steps.${stepId}.config.note`,
          "בשלב Surense חסרה הערה."
        );
      }
    }
  }

  return {
    valid:
      !issues.some(
        (
          issue
        ) =>
          issue.severity ===
          "error"
      ),
    issues,
  };
}
