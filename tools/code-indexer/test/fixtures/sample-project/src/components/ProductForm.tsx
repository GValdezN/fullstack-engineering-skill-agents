import React, { useState } from 'react';
import { calculatePrice } from '../services/pricing';

interface Props {
  onSubmit: (data: { name: string; price: number }) => void;
}

export function ProductForm({ onSubmit }: Props) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = calculatePrice(cost, 0.3);
    onSubmit({ name, price: result.total });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={e => setName(e.target.value)} />
      <input type="number" value={cost} onChange={e => setCost(Number(e.target.value))} />
      <button type="submit">Add Product</button>
    </form>
  );
}

export const ProductCard = ({ product }: { product: { name: string; price: number } }) => {
  return (
    <div className="card">
      <h3>{product.name}</h3>
      <p>${product.price.toFixed(2)}</p>
    </div>
  );
};
