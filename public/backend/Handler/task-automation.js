// Task Automation System
// Auto-generates recommended tasks based on sugarcane crop cycle

import { db } from '../Common/firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { VARIETY_HARVEST_DAYS } from './growth-tracker.js';

/**
 * Generate recommended crop cycle tasks after planting
 * @param {string} fieldId - The field ID
 * @param {string} handlerId - The handler/landowner ID
 * @param {string} variety - Sugarcane variety
 * @param {Date} plantingDate - Date of planting
 * @returns {Promise<Array>} Array of created task IDs
 */
export async function generateCropCycleTasks(fieldId, handlerId, variety, plantingDate) {
  console.log(`🌱 Auto-generating crop cycle tasks for field ${fieldId}, variety: ${variety}`);

  const harvestDays = VARIETY_HARVEST_DAYS[variety] || 365;
  const createdTasks = [];

  // Helper function to add days to a date
  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // ========================================
  // TASK TEMPLATES BY GROWTH STAGE
  // ========================================

  const taskTemplates = [
    {
      title: "Basal Fertilizer (0–30 DAP)",
      taskType: "basal_fertilizer",
      description: "Apply basal fertilizer during germination stage. Critical for healthy root and tiller development.",
      deadline: addDays(plantingDate, 15), // Target: Day 15 (middle of window)
      dapWindow: "0-30",
      priority: "high",
      stage: "Germination",
      notes: "Use complete fertilizer (14-14-14 or similar). Apply 2-4 bags per hectare depending on soil test results."
    },
    {
      title: "Gap Filling",
      taskType: "gap_filling",
      description: "Replace missing or dead seedlings to ensure uniform plant population.",
      deadline: addDays(plantingDate, 20),
      dapWindow: "15-30",
      priority: "medium",
      stage: "Germination",
      notes: "Use same variety. Best done after germination is complete (80-90% emergence)."
    },
    {
      title: "Main Fertilization (45–60 DAP)",
      taskType: "main_fertilization",
      description: "⚠️ CRITICAL: Apply main fertilization during tillering stage. Missing this window significantly reduces yield!",
      deadline: addDays(plantingDate, 52), // Target: Day 52 (middle of window)
      dapWindow: "45-60",
      priority: "critical",
      stage: "Tillering",
      notes: "Apply nitrogen-rich fertilizer (urea or ammonium sulfate). This is the MOST IMPORTANT fertilization - do not miss this window!"
    },
    {
      title: "Weeding & Cultivation",
      taskType: "weeding",
      description: "Remove weeds and cultivate soil between rows to improve aeration and water infiltration.",
      deadline: addDays(plantingDate, 60),
      dapWindow: "30-90",
      priority: "medium",
      stage: "Tillering",
      notes: "Mechanical or manual weeding. Avoid herbicides near young tillers."
    },
    {
      title: "Pest & Disease Monitoring",
      taskType: "pest_control",
      description: "Regular monitoring for borers, aphids, and fungal diseases during active growth.",
      deadline: addDays(plantingDate, 90),
      dapWindow: "60-180",
      priority: "medium",
      stage: "Grand Growth",
      notes: "Inspect weekly. Apply pesticides only when pest population exceeds threshold levels."
    },
    {
      title: "Optional Top Dressing",
      taskType: "top_dressing",
      description: "Optional additional fertilizer application if growth appears stunted or leaves show yellowing.",
      deadline: addDays(plantingDate, 120),
      dapWindow: "90-150",
      priority: "low",
      stage: "Grand Growth",
      notes: "Not always necessary. Conduct soil test or leaf analysis before applying."
    },
    {
      title: "Pre-Harvest Irrigation Management",
      taskType: "irrigation",
      description: "Reduce irrigation frequency to allow sugar accumulation. Stop irrigation 2-3 weeks before harvest.",
      deadline: addDays(plantingDate, harvestDays - 30),
      dapWindow: `${harvestDays-45}-${harvestDays-14}`,
      priority: "medium",
      stage: "Maturity",
      notes: "Water stress during maturity improves sugar content. Coordinate with mill delivery schedule."
    },
    {
      title: "Harvest Preparation",
      taskType: "harvest_prep",
      description: "Coordinate with sugar mill, arrange transportation, and prepare harvesting equipment.",
      deadline: addDays(plantingDate, harvestDays - 21),
      dapWindow: `${harvestDays-30}-${harvestDays-7}`,
      priority: "high",
      stage: "Maturity",
      notes: "Confirm mill delivery slot. Inspect field access roads. Prepare worker accommodations if needed."
    },
    {
      title: "Harvesting",
      taskType: "harvesting",
      description: "Harvest sugarcane at optimal maturity. Coordinate with mill schedule for fresh delivery.",
      deadline: addDays(plantingDate, harvestDays),
      dapWindow: `${harvestDays-10}-${harvestDays+10}`,
      priority: "critical",
      stage: "Harvest",
      notes: `Optimal harvest: ${harvestDays} DAP for ${variety}. Deliver to mill within 24-48 hours of cutting for best sucrose recovery.`
    }
  ];

  // ========================================
  // CREATE TASKS IN FIRESTORE
  // ========================================

  for (const template of taskTemplates) {
    try {
      const taskPayload = {
        fieldId: fieldId,
        created_by: handlerId,
        createdBy: handlerId,
        title: template.title,
        taskType: template.taskType,
        description: template.description,
        notes: template.notes || '',
        deadline: template.deadline,
        dapWindow: template.dapWindow,
        growthStage: template.stage,
        priority: template.priority,
        status: 'pending',
        assignedTo: [], // Handler can assign workers/drivers later
        autoGenerated: true, // Flag to show this is a template
        generatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'tasks'), taskPayload);
      createdTasks.push(docRef.id);

      console.log(`✅ Created task: ${template.title} (${docRef.id})`);
    } catch (error) {
      console.error(`❌ Error creating task "${template.title}":`, error);
    }
  }

  console.log(`🎉 Task automation complete! Created ${createdTasks.length} tasks for field ${fieldId}`);
  return createdTasks;
}

/**
 * Get recommended tasks based on current DAP
 * (For showing in create-task modal)
 * @param {number} currentDAP - Current days after planting
 * @param {string} variety - Sugarcane variety
 * @returns {Array} Array of recommended tasks
 */
export function getRecommendedTasksForDAP(currentDAP, variety) {
  const harvestDays = VARIETY_HARVEST_DAYS[variety] || 365;
  const recommendations = [];

  // Basal Fertilization (0-30 DAP)
  if (currentDAP >= 0 && currentDAP <= 30) {
    recommendations.push({
      task: "Basal Fertilizer",
      taskType: "basal_fertilizer",
      urgency: currentDAP > 25 ? "high" : "medium",
      reason: `Should be done within 0-30 DAP window (currently ${currentDAP} DAP)`,
      daysLeft: 30 - currentDAP,
      stage: "Germination"
    });
  }

  // Main Fertilization (45-60 DAP)
  if (currentDAP >= 40 && currentDAP <= 65) {
    let urgency = "medium";
    let reason = `Approaching main fertilization window (45-60 DAP, currently ${currentDAP} DAP)`;

    if (currentDAP >= 45 && currentDAP <= 60) {
      urgency = "critical";
      reason = `🚨 URGENT: Within critical fertilization window! (${60 - currentDAP} days remaining)`;
    } else if (currentDAP > 60) {
      urgency = "overdue";
      reason = `❌ OVERDUE: Should have been done at 45-60 DAP (${currentDAP - 60} days late)`;
    }

    recommendations.push({
      task: "Main Fertilization",
      taskType: "main_fertilization",
      urgency: urgency,
      reason: reason,
      daysLeft: currentDAP <= 60 ? 60 - currentDAP : null,
      daysLate: currentDAP > 60 ? currentDAP - 60 : null,
      stage: "Tillering"
    });
  }

  // Weeding (30-90 DAP)
  if (currentDAP >= 30 && currentDAP <= 100) {
    recommendations.push({
      task: "Weeding & Cultivation",
      taskType: "weeding",
      urgency: "medium",
      reason: `Recommended during tillering/grand growth stage (${currentDAP} DAP)`,
      stage: "Tillering/Grand Growth"
    });
  }

  // Harvest Preparation
  if (currentDAP >= harvestDays - 45 && currentDAP < harvestDays) {
    recommendations.push({
      task: "Harvest Preparation",
      taskType: "harvest_prep",
      urgency: "high",
      reason: `Approaching harvest date (${harvestDays} DAP, currently ${currentDAP} DAP)`,
      daysLeft: harvestDays - currentDAP,
      stage: "Maturity"
    });
  }

  // Harvesting
  if (currentDAP >= harvestDays - 10) {
    let urgency = "high";
    let reason = `Harvest window is near (optimal: ${harvestDays} DAP)`;

    if (currentDAP >= harvestDays - 5 && currentDAP <= harvestDays + 5) {
      urgency = "critical";
      reason = `🌾 HARVEST NOW: Within optimal window (${harvestDays} DAP ± 5 days)`;
    } else if (currentDAP > harvestDays + 10) {
      urgency = "overdue";
      reason = `⚠️ OVERDUE: Harvest is ${currentDAP - harvestDays} days late. Quality may be declining.`;
    }

    recommendations.push({
      task: "Harvesting",
      taskType: "harvesting",
      urgency: urgency,
      reason: reason,
      stage: "Harvest"
    });
  }

  return recommendations;
}
