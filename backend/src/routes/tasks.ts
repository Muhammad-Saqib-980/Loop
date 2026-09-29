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

const recurrenceSchema = z.object({
  type: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().positive(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  endDate: z.string().optional(),
});

const newTaskSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  recurrence: recurrenceSchema.optional(),
});

const updateTaskSchema = newTaskSchema.partial();

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
    const deleted = await deleteTask(req.userId!, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(204).send();
  });

  router.post('/:id/toggle', async (req: AuthedRequest, res) => {
    const task = await toggleTaskComplete(req.userId!, req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(200).json(task);
  });

  return router;
}
