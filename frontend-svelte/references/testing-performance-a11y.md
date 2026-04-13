# Testing, Performance & Accessibility

## 7. Testing

### Unit Tests with Vitest

```typescript
// Button.test.ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { expect, test, describe, vi } from 'vitest';
import Button from './Button.svelte';

describe('Button', () => {
  test('renders with text', () => {
    render(Button, { props: { children: 'Click me' } });
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  test('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(Button, { props: { onclick: onClick } });

    await fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('is disabled when disabled prop is true', () => {
    render(Button, { props: { disabled: true } });
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Integration Tests

```typescript
// login.test.ts
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import LoginPage from './+page.svelte';

test('login flow', async () => {
  const mockFetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: 'abc123' })
    })
  );

  global.fetch = mockFetch;

  render(LoginPage);

  await fireEvent.input(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' }
  });

  await fireEvent.input(screen.getByLabelText('Password'), {
    target: { value: 'password123' }
  });

  await fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.any(Object));
  });
});
```

---

## 8. Performance Optimization

### Code Splitting

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let HeavyComponent;

  onMount(async () => {
    const module = await import('./HeavyComponent.svelte');
    HeavyComponent = module.default;
  });
</script>

{#if HeavyComponent}
  <svelte:component this={HeavyComponent} />
{:else}
  <div>Loading...</div>
{/if}
```

### Image Optimization

```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  export let src: string;
  export let alt: string;

  let loaded = false;
  let visible = false;

  function handleIntersection(entries: IntersectionObserverEntry[]) {
    if (entries[0].isIntersecting) {
      visible = true;
    }
  }

  function setupObserver(node: HTMLElement) {
    if (!browser) return;

    const observer = new IntersectionObserver(handleIntersection);
    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      }
    };
  }
</script>

<div use:setupObserver class="aspect-video bg-muted">
  {#if visible}
    <img
      {src}
      {alt}
      loading="lazy"
      class:opacity-0={!loaded}
      class:opacity-100={loaded}
      class="transition-opacity duration-300"
      on:load={() => loaded = true}
    />
  {/if}
</div>
```

### Preloading Data

```typescript
// routes/+layout.ts
export const preload = () => {
  return {
    // Preload critical data
  };
};
```

---

## 9. Accessibility Best Practices

```svelte
<script lang="ts">
  import { createDialog } from '@melt-ui/svelte';

  const {
    elements: { trigger, overlay, content, title, description, close },
    states: { open }
  } = createDialog();
</script>

<button use:trigger>Open Dialog</button>

{#if $open}
  <div use:overlay class="fixed inset-0 bg-black/50" />
  <div
    use:content
    role="dialog"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-description"
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
  >
    <h2 use:title id="dialog-title">Dialog Title</h2>
    <p use:description id="dialog-description">Dialog description</p>

    <button use:close aria-label="Close dialog">
      <X class="h-4 w-4" />
    </button>
  </div>
{/if}
```
