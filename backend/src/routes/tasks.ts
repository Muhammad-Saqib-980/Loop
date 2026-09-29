import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import {
  createTask,
  deleteTask,
  listTasks,
  toggleTaskComplete,
  updateTask,
} from '../services/taskService';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidTaskId(id: string): boolean {
  return UUID_RE.test(id);
}

const recurrenceSchema = z.object({
  type: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().positive(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  endDate: z.string().regex(ISO_DATE_RE).optional(),
});

const newTaskSchema = z.object({
  title: z.string().trim().min(1),
  notes: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().regex(ISO_DATE_RE).optional(),
  recurrence: recurrenceSchema.optional(),
});

// Update payloads must additionally be able to clear dueDate, recurrence, and
// notes by sending `null` - the DB layer (TaskUpdateRow) already supports
// this. The create schema is left untouched since a new task should still
// require these fields via the existing (non-nullable) rules.
const updateTaskSchema = newTaskSchema.partial().extend({
  notes: z.string().nullable().optional(),
  dueDate: z.string().regex(ISO_DATE_RE).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});

export function createTasksRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req: AuthedRequest, res) => {
    const tasks = await listTasks(req.userId!);
    res.status(200).json(tasks);
  });

  router.post('/', async (req: AuthedRequest, res) => {
    const parsed = newTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid task' });
      return;
    }
    const task = await createTask(req.userId!, parsed.data);
    res.status(201).json(task);
  });

  router.patch('/:id', async (req: AuthedRequest, res) => {
    if (!isValidTaskId(req.params.id)) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid task update' });
      return;
    }
    const task = await updateTask(req.userId!, req.params.id, parsed.data);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(200).json(task);
  });

  router.delete('/:id', async (req: AuthedRequest, res) => {
    if (!isValidTaskId(req.params.id)) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const deleted = await deleteTask(req.userId!, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(204).send();
  });

  router.post('/:id/toggle', async (req: AuthedRequest, res) => {
    if (!isValidTaskId(req.params.id)) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const task = await toggleTaskComplete(req.userId!, req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(200).json(task);
  });

  return router;
}
