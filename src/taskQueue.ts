type Task = () => Promise<any>;

export class TaskQueue {
    private queue: Task[] = [];
    private isRunning: boolean = false;
  
    async add(task: Task): Promise<void> {
      this.queue.push(task);
      if (!this.isRunning) {
        await this.run();
      }
    }
  
    private async run(): Promise<void> {
      this.isRunning = true;
      while (this.queue.length > 0) {
        const task = this.queue.shift();
        if (task) {
          try {
            await task();
          } catch (err) {
            console.error("Task failed:", err);
          }
        }
      }
      this.isRunning = false;
    }
  }
  