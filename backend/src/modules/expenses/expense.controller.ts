import type { Request, Response } from "express";
import { getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as expenseService from "./expense.service.js";
import { createExpenseBodySchema, updateExpenseBodySchema } from "./expense.validators.js";

export const expenseController = {
  async list(req: Request, res: Response): Promise<void> {
    const out = await expenseService.listExpenses(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createExpenseBodySchema, req.body);
    const row = await expenseService.createExpense(body);
    res.status(201).json({ data: row });
  },

  async update(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateExpenseBodySchema, req.body);
    const row = await expenseService.updateExpense(req.params.id!, body);
    res.json({ data: row });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await expenseService.deleteExpense(req.params.id!);
    res.status(204).send();
  },

  async summary(req: Request, res: Response): Promise<void> {
    const out = await expenseService.getExpenseSummary(getQueryRecord(req));
    res.json({ data: out });
  },
};
